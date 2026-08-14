package gateway

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"

	"eduardoos/pkg/common"
	"eduardoos/pkg/s3store"

	"github.com/go-chi/chi/v5"
)

// validHumanToken accepts "ok:{skillId}:{heldSeconds}" with heldSeconds >= 5.
// This is a lightweight friction check (not cryptographic auth).
func validHumanToken(token string) bool {
	parts := strings.Split(strings.TrimSpace(token), ":")
	if len(parts) != 3 || parts[0] != "ok" || parts[1] == "" {
		return false
	}
	secs, err := strconv.Atoi(parts[2])
	if err != nil || secs < 5 {
		return false
	}
	return true
}

// Professional profile context shipped with public skill-chat (home page).
const professionalProfileContext = `Name: Eduardo Osteicoechea
Title: AEC Technologist

Summary:
Licensed Building Architect, BIM Practitioner, Full Stack BIM–Desktop–Web–Cloud Software Developer,
AI Integrationist, English proficient and Spanish native, research enthusiast, and interdisciplinary
professional focused on full-stack AEC solutions, cloud applications, AI integration, BIM collaboration,
and practical problem solving.

Core skills:
- Licensed Building Architect
- BIM Practitioner
- Full Stack Software Developer
- BIM Software Developer
- Desktop Software Developer
- Web Software Developer
- Cloud Software Developer
- AI Integrationist
- English proficient and Spanish native
- Research enthusiast
- Interdisciplinary problem solving

Focus areas:
Architecture and construction technology, Building Information Modeling (BIM), software engineering across
desktop/web/cloud, and integrating AI into AEC workflows and products.`

func registerProfilePublicRoutes(r chi.Router, cfg config) {
	r.Get("/api/media/skills/{skillId}", cfg.listSkillMedia())
	r.Post("/api/profile/ask", cfg.askProfessionalProfile())
}

func (c config) listSkillMedia() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		skillID := strings.TrimSpace(chi.URLParam(r, "skillId"))
		if skillID == "" || strings.Contains(skillID, "..") || strings.Contains(skillID, "/") {
			common.WriteError(w, http.StatusBadRequest, "invalid skillId")
			return
		}
		prefix := "skills/" + skillID
		target := strings.TrimRight(c.S3URL, "/") + "/objects?prefix=" + url.QueryEscape(prefix)
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			// Empty folders are fine for visitors before media is uploaded.
			common.WriteJSON(w, http.StatusOK, map[string]any{
				"skillId": skillID,
				"prefix":  prefix,
				"count":   0,
				"items":   []any{},
			})
			return
		}
		var payload struct {
			Objects []s3store.ObjectMeta `json:"objects"`
		}
		if err := json.Unmarshal(body, &payload); err != nil {
			common.WriteError(w, http.StatusBadGateway, "invalid s3 response")
			return
		}
		s3Prefix := common.Env("S3_PREFIX", "media")
		type mediaItem struct {
			Key         string `json:"key"`
			Name        string `json:"name"`
			ContentType string `json:"contentType"`
			URL         string `json:"url"`
			Kind        string `json:"kind"` // image | video | other
		}
		items := make([]mediaItem, 0)
		for _, obj := range payload.Objects {
			rel := s3store.RelativeKey(s3Prefix, obj.Key)
			if rel == "" {
				rel = obj.Key
			}
			name := path.Base(rel)
			ct := strings.ToLower(strings.TrimSpace(obj.ContentType))
			kind := "other"
			nameLower := strings.ToLower(name)
			switch {
			case strings.HasPrefix(ct, "image/"):
				kind = "image"
			case strings.HasPrefix(ct, "video/"):
				kind = "video"
			case strings.HasSuffix(nameLower, ".mp4"),
				strings.HasSuffix(nameLower, ".webm"),
				strings.HasSuffix(nameLower, ".mov"):
				kind = "video"
			case strings.HasSuffix(nameLower, ".jpg"),
				strings.HasSuffix(nameLower, ".jpeg"),
				strings.HasSuffix(nameLower, ".png"),
				strings.HasSuffix(nameLower, ".webp"),
				strings.HasSuffix(nameLower, ".gif"):
				kind = "image"
			}
			if kind == "other" {
				continue
			}
			items = append(items, mediaItem{
				Key:         obj.Key,
				Name:        name,
				ContentType: obj.ContentType,
				URL:         "/api/media/file/" + s3store.EncodeRelativePath(rel),
				Kind:        kind,
			})
		}
		common.WriteJSON(w, http.StatusOK, map[string]any{
			"skillId": skillID,
			"prefix":  prefix,
			"count":   len(items),
			"items":   items,
		})
	}
}

func (c config) askProfessionalProfile() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cid := common.CorrelationFromRequest(r)
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "profile.ask", "started"), cid)

		var body struct {
			Question string   `json:"question"`
			Skill    string   `json:"skill"`
			History  []string `json:"history"`
			// Client must echo a simple proof token after holding the anti-bot checkbox.
			HumanToken string `json:"humanToken"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			common.WriteError(w, http.StatusBadRequest, "invalid body")
			return
		}
		if !validHumanToken(body.HumanToken) {
			common.WriteError(w, http.StatusForbidden, "human verification required")
			return
		}
		q := strings.TrimSpace(body.Question)
		if q == "" {
			common.WriteError(w, http.StatusBadRequest, "question required")
			return
		}
		if len(q) > 2000 {
			q = q[:2000]
		}
		if c.ChatbotURL == "" {
			common.WriteError(w, http.StatusServiceUnavailable, "CHATBOT_URL is not configured")
			return
		}
		payload, _ := json.Marshal(map[string]any{
			"role":        "profile_qa",
			"topic":       strings.TrimSpace(body.Skill),
			"userArg":     q,
			"articleText": professionalProfileContext,
			"history":     body.History,
		})
		req, err := http.NewRequest(http.MethodPost, strings.TrimRight(c.ChatbotURL, "/")+"/llm", bytes.NewReader(payload))
		if err != nil {
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(common.CorrelationHeader, cid)
		req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(c.InternalSecret, cid))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("[correlation=%s] profile.ask llm error: %v", cid, err)
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "profile.ask", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		if resp.StatusCode >= 400 {
			c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "profile.ask", "error"), cid)
			common.WriteError(w, http.StatusBadGateway, string(out))
			return
		}
		var parsed struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(out, &parsed); err != nil {
			common.WriteError(w, http.StatusBadGateway, "invalid chatbot response")
			return
		}
		c.Telemetry.Emit(common.NewFlightLog(cid, "backend", "profile.ask", "success"), cid)
		common.WriteJSON(w, http.StatusOK, map[string]any{"answer": parsed.Text})
	}
}
