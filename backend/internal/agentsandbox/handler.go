// Package agentsandbox is the admin-only Agent Sandbox: DeepSeek reasoning
// chat that proposes static website artifacts stored only under
// agentsandbox/{adminSafe}/ on S3. No local disk writes and no shell.
package agentsandbox

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	rootPrefix   = "agentsandbox"
	maxFileBytes = 2 << 20
	maxChatBytes = 4 << 20
	maxFiles     = 40
)

var validName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$`)
var chatIDRe = regexp.MustCompile(`^[a-zA-Z0-9-]{8,64}$`)
var allowedExtensions = map[string]string{
	".html": "text/html",
	".css":  "text/css",
	".js":   "text/javascript",
	".json": "application/json",
	".txt":  "text/plain",
	".svg":  "image/svg+xml",
	".md":   "text/markdown",
	".py":   "text/x-python",
	".pdf":  "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
var binaryExtensions = map[string]bool{
	".pdf": true, ".docx": true, ".xlsx": true,
}

// Message is one chat turn.
type Message struct {
	Role string `json:"role"`
	Text string `json:"text"`
	At   string `json:"at"`
}

// File is a static website or document artifact.
type File struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Text     string `json:"text"`
	Encoding string `json:"encoding,omitempty"` // "base64" for binary docs
}

// Tab is a preview tab pointing at an HTML file.
type Tab struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	File  string `json:"file"`
}

// Chat is one conversation under a site (messages only; files live on the site).
type Chat struct {
	ID       string    `json:"id"`
	SiteID   string    `json:"siteId"`
	Title    string    `json:"title"`
	Spec     string    `json:"spec,omitempty"`     // legacy
	Messages []Message `json:"messages"`
	Files    []File    `json:"files,omitempty"` // legacy
	Tabs     []Tab     `json:"tabs,omitempty"`  // legacy
	Updated  string    `json:"updated"`
}

// ChatSummary is a lightweight row for the history list.
type ChatSummary struct {
	ID      string `json:"id"`
	SiteID  string `json:"siteId,omitempty"`
	Title   string `json:"title"`
	Updated string `json:"updated"`
}

// ChatIndex lists all chats for an admin.
type ChatIndex struct {
	Chats []ChatSummary `json:"chats"`
}

// Handler serves /api/admin/agent-sandbox/*.
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	auth      *auth.Handler
	s3        *s3.Client
	bucket    string
}

// NewHandler opens S3 when available.
func NewHandler(ctx context.Context, jwtSecret string, users auth.UserStore) *Handler {
	h := &Handler{
		JWTSecret: jwtSecret,
		Users:     users,
		auth:      &auth.Handler{JWTSecret: jwtSecret, Store: users},
		bucket:    strings.TrimSpace(httpx.Env("S3_BUCKET", "")),
	}
	if h.bucket != "" {
		if cfg, err := awsx.LoadConfig(ctx); err == nil {
			h.s3 = s3.NewFromConfig(cfg)
		}
	}
	return h
}

// Routes mounts JWT + admin-only Agent Sandbox endpoints.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)
		pr.Use(h.requireAdmin)
		pr.Get("/api/admin/agent-sandbox/sites", h.ListSites)
		pr.Post("/api/admin/agent-sandbox/sites", h.CreateSite)
		pr.Get("/api/admin/agent-sandbox/sites/{id}", h.GetSite)
		pr.Patch("/api/admin/agent-sandbox/sites/{id}", h.PatchSite)
		pr.Get("/api/admin/agent-sandbox/sites/{id}/files", h.ListSiteFiles)
		pr.Put("/api/admin/agent-sandbox/sites/{id}/files", h.PutSiteFile)
		pr.Get("/api/admin/agent-sandbox/sites/{id}/files/{name}/download", h.DownloadSiteFile)
		pr.Get("/api/admin/agent-sandbox/chats", h.ListChats)
		pr.Post("/api/admin/agent-sandbox/chats", h.CreateChat)
		pr.Get("/api/admin/agent-sandbox/chats/{id}", h.GetChat)
		pr.Delete("/api/admin/agent-sandbox/chats/{id}", h.DeleteChat)
		pr.Get("/api/admin/agent-sandbox/deepseek/balance", h.DeepSeekBalance)
		pr.Post("/api/admin/agent-sandbox/chats/{id}/ask", h.Ask)
		pr.Post("/api/admin/agent-sandbox/chats/{id}/files", h.PutFile)
		pr.Get("/api/admin/agent-sandbox/chats/{id}/files", h.ListFiles)
		pr.Post("/api/admin/agent-sandbox/crawl", h.Crawl)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if h.Users != nil {
			if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok {
				role = u.Role
			}
		}
		if !auth.IsAdmin(email, role) {
			httpx.WriteError(w, http.StatusForbidden, "admin only")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func safeEmail(email string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(email)), "@", "_at_")
}

func (h *Handler) adminPrefix(email string) string {
	return rootPrefix + "/" + safeEmail(email)
}

func (h *Handler) indexKey(email string) string {
	return h.adminPrefix(email) + "/chats/index.json"
}

func (h *Handler) chatKey(email, id string) string {
	return h.adminPrefix(email) + "/chats/" + id + ".json"
}

func (h *Handler) ensureS3() error {
	if h.s3 == nil || h.bucket == "" {
		return fmt.Errorf("agentsandbox S3 is not configured")
	}
	return nil
}

func (h *Handler) putJSON(ctx context.Context, key string, value any) error {
	if !strings.HasPrefix(key, rootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = h.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(h.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(raw),
		ContentType: aws.String("application/json"),
	})
	return err
}

func (h *Handler) getJSON(ctx context.Context, key string, dest any) (bool, error) {
	out, err := h.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(h.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		msg := strings.ToLower(err.Error())
		if strings.Contains(msg, "nosuchkey") || strings.Contains(msg, "not found") || strings.Contains(msg, "404") {
			return false, nil
		}
		return false, err
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(out.Body, maxChatBytes))
	if err != nil {
		return false, err
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (h *Handler) deleteKey(ctx context.Context, key string) error {
	if !strings.HasPrefix(key, rootPrefix+"/") {
		return fmt.Errorf("invalid object key")
	}
	_, err := h.s3.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(h.bucket),
		Key:    aws.String(key),
	})
	return err
}

func (h *Handler) loadIndex(ctx context.Context, email string) (ChatIndex, error) {
	var idx ChatIndex
	ok, err := h.getJSON(ctx, h.indexKey(email), &idx)
	if err != nil {
		return ChatIndex{}, err
	}
	if !ok || idx.Chats == nil {
		idx.Chats = []ChatSummary{}
	}
	return idx, nil
}

func (h *Handler) saveIndex(ctx context.Context, email string, idx ChatIndex) error {
	sort.Slice(idx.Chats, func(i, j int) bool {
		return idx.Chats[i].Updated > idx.Chats[j].Updated
	})
	return h.putJSON(ctx, h.indexKey(email), idx)
}

func emptyChat(id, siteID string) Chat {
	now := time.Now().UTC().Format(time.RFC3339)
	return Chat{
		ID:       id,
		SiteID:   siteID,
		Title:    "Nueva conversación",
		Messages: []Message{},
		Updated:  now,
	}
}

func (h *Handler) loadChat(ctx context.Context, email, id string) (Chat, error) {
	if !chatIDRe.MatchString(id) {
		return Chat{}, fmt.Errorf("invalid chat id")
	}
	var chat Chat
	ok, err := h.getJSON(ctx, h.chatKey(email, id), &chat)
	if err != nil {
		return Chat{}, err
	}
	if !ok {
		return Chat{}, fmt.Errorf("chat not found")
	}
	if chat.Messages == nil {
		chat.Messages = []Message{}
	}
	return chat, nil
}

func (h *Handler) saveChat(ctx context.Context, email string, chat Chat) error {
	chat.Updated = time.Now().UTC().Format(time.RFC3339)
	// Durable artifacts live on the site; strip legacy fields when rewriting.
	chat.Files = nil
	chat.Tabs = nil
	chat.Spec = ""
	if err := h.putJSON(ctx, h.chatKey(email, chat.ID), chat); err != nil {
		return err
	}
	if chat.SiteID == "" {
		return nil
	}
	site, err := h.loadSite(ctx, email, chat.SiteID)
	if err != nil {
		return err
	}
	found := false
	for _, id := range site.ChatIDs {
		if id == chat.ID {
			found = true
			break
		}
	}
	if !found {
		site.ChatIDs = append(site.ChatIDs, chat.ID)
		return h.saveSite(ctx, email, site)
	}
	// Touch site updated so sites list sorts by activity.
	return h.saveSite(ctx, email, site)
}

func noStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
}

// ListChats returns conversation summaries for a site (?siteId= required after migrate).
func (h *Handler) ListChats(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	email := auth.UserEmailFromRequest(r)
	if _, err := h.ensureSites(r.Context(), email); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	siteID := strings.TrimSpace(r.URL.Query().Get("siteId"))
	if siteID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "siteId required")
		return
	}
	site, err := h.loadSite(r.Context(), email, siteID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	chats, err := h.chatSummariesForSite(r.Context(), email, site)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"chats": chats, "siteId": siteID})
}

type createChatRequest struct {
	SiteID string `json:"siteId"`
}

// CreateChat starts an empty conversation under a site.
func (h *Handler) CreateChat(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var req createChatRequest
	_ = json.NewDecoder(io.LimitReader(r.Body, 8<<10)).Decode(&req)
	siteID := strings.TrimSpace(req.SiteID)
	if siteID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "siteId required")
		return
	}
	email := auth.UserEmailFromRequest(r)
	if _, err := h.loadSite(r.Context(), email, siteID); err != nil {
		httpx.WriteError(w, http.StatusNotFound, "site not found")
		return
	}
	chat := emptyChat(uuid.NewString(), siteID)
	if err := h.saveChat(r.Context(), email, chat); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusCreated, chat)
}

// GetChat loads one conversation.
func (h *Handler) GetChat(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	chat, err := h.loadChat(r.Context(), auth.UserEmailFromRequest(r), chi.URLParam(r, "id"))
	if err != nil {
		code := http.StatusBadGateway
		if strings.Contains(err.Error(), "not found") || strings.Contains(err.Error(), "invalid") {
			code = http.StatusNotFound
		}
		httpx.WriteError(w, code, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, chat)
}

// DeleteChat removes a conversation and drops it from the site chatIds.
func (h *Handler) DeleteChat(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	email := auth.UserEmailFromRequest(r)
	id := chi.URLParam(r, "id")
	if !chatIDRe.MatchString(id) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid chat id")
		return
	}
	chat, _ := h.loadChat(r.Context(), email, id)
	if err := h.deleteKey(r.Context(), h.chatKey(email, id)); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var chats []ChatSummary
	if chat.SiteID != "" {
		site, err := h.loadSite(r.Context(), email, chat.SiteID)
		if err == nil {
			next := make([]string, 0, len(site.ChatIDs))
			for _, cid := range site.ChatIDs {
				if cid != id {
					next = append(next, cid)
				}
			}
			site.ChatIDs = next
			_ = h.saveSite(r.Context(), email, site)
			chats, _ = h.chatSummariesForSite(r.Context(), email, site)
		}
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "chats": chats})
}

// DeepSeekBalance proxies GET /user/balance for the console footer.
func (h *Handler) DeepSeekBalance(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(httpx.Env("DEEPSEEK_API_KEY", ""))
	if key == "" {
		httpx.WriteError(w, http.StatusBadGateway, "DEEPSEEK_API_KEY is not configured")
		return
	}
	base := strings.TrimRight(httpx.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/")
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, base+"/user/balance", nil)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	req.Header.Set("Authorization", "Bearer "+key)
	res, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "DeepSeek balance request failed: "+err.Error())
		return
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		httpx.WriteError(w, http.StatusBadGateway, fmt.Sprintf("DeepSeek balance status %d: %s", res.StatusCode, strings.TrimSpace(string(raw))))
		return
	}
	var body struct {
		IsAvailable  bool `json:"is_available"`
		BalanceInfos []struct {
			Currency        string `json:"currency"`
			TotalBalance    string `json:"total_balance"`
			GrantedBalance  string `json:"granted_balance"`
			ToppedUpBalance string `json:"topped_up_balance"`
		} `json:"balance_infos"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "invalid DeepSeek balance JSON")
		return
	}
	currency := "USD"
	total := "0"
	granted := "0"
	topped := "0"
	if len(body.BalanceInfos) > 0 {
		info := body.BalanceInfos[0]
		for _, row := range body.BalanceInfos {
			if strings.EqualFold(row.Currency, "USD") {
				info = row
				break
			}
		}
		if info.Currency != "" {
			currency = info.Currency
		}
		if info.TotalBalance != "" {
			total = info.TotalBalance
		}
		granted = info.GrantedBalance
		topped = info.ToppedUpBalance
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"is_available":      body.IsAvailable,
		"currency":          currency,
		"total_balance":     total,
		"granted_balance":   granted,
		"topped_up_balance": topped,
	})
}

func validateFile(f File) error {
	f.Name = strings.TrimSpace(f.Name)
	ext := strings.ToLower(path.Ext(f.Name))
	if !validName.MatchString(f.Name) || strings.Count(f.Name, ".") != 1 || allowedExtensions[ext] == "" {
		return fmt.Errorf("unsupported file name or type")
	}
	payload := f.Text
	if binaryExtensions[ext] || strings.EqualFold(f.Encoding, "base64") {
		raw, err := decodeMaybeBase64(f.Text)
		if err != nil {
			return fmt.Errorf("invalid base64 binary file")
		}
		if len(raw) > maxFileBytes {
			return fmt.Errorf("file exceeds 2 MiB")
		}
		return nil
	}
	if len(payload) > maxFileBytes {
		return fmt.Errorf("file exceeds 2 MiB")
	}
	if ext == ".svg" {
		lower := strings.ToLower(f.Text)
		if strings.Contains(lower, "<script") || strings.Contains(lower, "foreignobject") ||
			strings.Contains(lower, "onload=") || strings.Contains(lower, "onclick=") {
			return fmt.Errorf("unsafe SVG")
		}
	}
	return nil
}

func decodeBase64(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\n", "")
	s = strings.ReplaceAll(s, "\r", "")
	return base64.StdEncoding.DecodeString(s)
}

func decodeMaybeBase64(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, fmt.Errorf("empty")
	}
	return decodeBase64(s)
}

func normalizeFileForStore(f File) File {
	ext := strings.ToLower(path.Ext(f.Name))
	f.Type = allowedExtensions[ext]
	if binaryExtensions[ext] {
		f.Encoding = "base64"
		// Ensure payload is valid base64 (agent may have sent raw — reject in validate).
	} else {
		f.Encoding = ""
		f.Text = unescapeFileText(f.Text)
	}
	return f
}

// unescapeFileText turns accidental JSON-style escapes into real newlines for text files.
func unescapeFileText(s string) string {
	if s == "" {
		return s
	}
	if strings.Contains(s, "\n") || strings.Contains(s, "\r") {
		return s
	}
	if !strings.Contains(s, `\n`) && !strings.Contains(s, `\r`) && !strings.Contains(s, `\t`) {
		return s
	}
	replacer := strings.NewReplacer(`\r\n`, "\n", `\n`, "\n", `\r`, "\n", `\t`, "\t")
	return replacer.Replace(s)
}

func sanitizeAssistantReply(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return raw
	}
	if strings.HasPrefix(raw, "{") {
		var obj map[string]any
		if err := json.Unmarshal([]byte(raw), &obj); err == nil {
			if reply, ok := obj["reply"].(string); ok && strings.TrimSpace(reply) != "" {
				return strings.TrimSpace(reply)
			}
		}
	}
	return unescapeFileText(raw)
}

func upsertFile(site *Site, f File) error {
	return upsertSiteFile(site, f)
}

// PutFile stores an admin-dropped artifact into the chat's site.
func (h *Handler) PutFile(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var f File
	if err := json.NewDecoder(io.LimitReader(r.Body, maxFileBytes+2048)).Decode(&f); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid file")
		return
	}
	email := auth.UserEmailFromRequest(r)
	chat, err := h.loadChat(r.Context(), email, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if chat.SiteID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "chat has no site")
		return
	}
	site, err := h.loadSite(r.Context(), email, chat.SiteID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := upsertSiteFile(&site, f); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.saveSite(r.Context(), email, site); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, site)
}

// ListFiles returns the website file structure for a chat's site.
func (h *Handler) ListFiles(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	email := auth.UserEmailFromRequest(r)
	chat, err := h.loadChat(r.Context(), email, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if chat.SiteID == "" {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{"chatId": chat.ID, "files": []any{}})
		return
	}
	site, err := h.loadSite(r.Context(), email, chat.SiteID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	noStore(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"chatId": chat.ID, "siteId": site.ID, "files": fileRows(site.Files)})
}

type askRequest struct {
	Message         string   `json:"message"`
	Allowlist       []string `json:"allowlist"`
	Model           string   `json:"model"`
	Thinking        string   `json:"thinking"`
	ReasoningEffort string   `json:"reasoningEffort"`
}

type proposal struct {
	Reply string         `json:"reply"`
	Spec  string         `json:"spec"`
	Files []proposalFile `json:"files"`
	Tabs  []Tab          `json:"tabs"`
}

// proposalFile accepts common model aliases for file body.
type proposalFile struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Text     string `json:"text"`
	Content  string `json:"content"`
	Body     string `json:"body"`
	Encoding string `json:"encoding"`
}

func (p proposalFile) toFile() File {
	text := p.Text
	if strings.TrimSpace(text) == "" {
		text = p.Content
	}
	if strings.TrimSpace(text) == "" {
		text = p.Body
	}
	return File{
		Name:     strings.TrimSpace(p.Name),
		Type:     p.Type,
		Text:     text,
		Encoding: p.Encoding,
	}
}

const (
	artifactsStart = "<<<ARTIFACTS>>>"
	artifactsEnd   = "<<<END>>>"
)

// Ask streams a DeepSeek reasoning reply as SSE, then persists the chat.
// Verbose `log` events explain each stage for the Agent Console UI.
func (h *Handler) Ask(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var req askRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil || strings.TrimSpace(req.Message) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "message required")
		return
	}
	email := auth.UserEmailFromRequest(r)
	chatID := chi.URLParam(r, "id")
	chat, err := h.loadChat(r.Context(), email, chatID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	if chat.SiteID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "chat has no site")
		return
	}
	site, err := h.loadSite(r.Context(), email, chat.SiteID)
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.WriteError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	writeSSE := func(event string, payload any) {
		raw, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, raw)
		flusher.Flush()
	}
	logf := func(level, msg string, extra map[string]any) {
		payload := map[string]any{
			"at":      time.Now().UTC().Format(time.RFC3339Nano),
			"level":   level,
			"message": msg,
		}
		for k, v := range extra {
			payload[k] = v
		}
		writeSSE("log", payload)
	}

	logf("info", "Ask started: loaded chat + site from S3 and opened SSE stream.", map[string]any{
		"chatId": chatID, "siteId": site.ID, "messageChars": len(req.Message), "existingFiles": len(site.Files),
	})
	logf("info", "Building DeepSeek system/user prompts.", map[string]any{
		"model":     resolveAskModel(req),
		"thinking":  resolveThinking(req),
		"effort":    resolveEffort(req),
		"specChars": len(site.Spec), "allowlist": req.Allowlist,
	})

	system := `You are an AI senior web developer and web crawler architect.
Write the admin-facing answer first as Markdown only (headings, lists, code fences OK). Never put JSON in the Markdown reply.
After the Markdown, on its own lines, append exactly:

<<<ARTIFACTS>>>
{"spec":"...","files":[{"name":"index.html","text":"..."}],"tabs":[{"id":"home","label":"Home","file":"index.html"}]}
<<<END>>>

Rules: flat file names only; allowed text: .html,.css,.js,.json,.txt,.svg,.md,.py; binary docs .pdf,.docx,.xlsx must use base64 in text with "encoding":"base64".
You may emit .py scripts that generate documents; also emit the finished .pdf/.docx/.xlsx/.txt as separate files (base64 for binaries).
No shell, network, credentials, or server code. One minimal global CSS using rem. Real newlines inside text fields (JSON will escape them).`
	user := fmt.Sprintf("Workspace spec:\n%s\nRequest:\n%s\nAllowed docs hosts: %s", site.Spec, req.Message, strings.Join(req.Allowlist, ", "))

	var full strings.Builder
	var visible strings.Builder
	artifactsStarted := false
	tokenCount := 0
	firstTokenLogged := false
	logf("info", "Calling DeepSeek reasoning stream (this can take several minutes).", nil)

	err = deepSeekReasoningStream(r.Context(), resolveAskModel(req), resolveThinking(req), resolveEffort(req), system, user, func(delta string) {
		full.WriteString(delta)
		if artifactsStarted {
			return
		}
		combined := visible.String() + delta
		if idx := strings.Index(combined, artifactsStart); idx >= 0 {
			artifactsStarted = true
			piece := combined[:idx]
			extra := piece[len(visible.String()):]
			if extra != "" {
				visible.WriteString(extra)
				writeSSE("token", map[string]string{"text": extra})
				tokenCount++
			}
			logf("info", "Detected <<<ARTIFACTS>>> marker — Markdown stream ends; collecting file JSON.", map[string]any{
				"visibleChars": len(visible.String()),
			})
			return
		}
		visible.WriteString(delta)
		writeSSE("token", map[string]string{"text": delta})
		tokenCount++
		if !firstTokenLogged {
			firstTokenLogged = true
			logf("info", "First Markdown token received from DeepSeek.", map[string]any{"chars": len(delta)})
		}
	}, func(stage, msg string) {
		logf("info", msg, map[string]any{"stage": stage})
	})
	if err != nil {
		logf("error", "DeepSeek stream failed.", map[string]any{"error": err.Error(), "tokensEmitted": tokenCount})
		writeSSE("error", map[string]string{"error": err.Error()})
		return
	}
	logf("info", "DeepSeek stream finished. Parsing Markdown + artifacts JSON.", map[string]any{
		"fullChars": full.Len(), "visibleChars": visible.Len(), "tokensEmitted": tokenCount,
	})

	md, art := splitArtifacts(full.String())
	if strings.TrimSpace(md) == "" {
		md = visible.String()
	}
	var p proposal
	p.Reply = sanitizeAssistantReply(md)
	if art != "" {
		if err := json.Unmarshal([]byte(art), &p); err != nil {
			logf("warn", "Artifacts JSON did not parse; keeping Markdown reply only.", map[string]any{
				"error": err.Error(), "artifactsChars": len(art),
			})
		} else {
			logf("info", "Artifacts JSON parsed.", map[string]any{
				"files": len(p.Files), "tabs": len(p.Tabs), "specChars": len(p.Spec),
			})
		}
		if strings.TrimSpace(p.Reply) == "" {
			p.Reply = sanitizeAssistantReply(md)
		} else {
			p.Reply = sanitizeAssistantReply(p.Reply)
		}
	} else {
		logf("warn", "No <<<ARTIFACTS>>> block in model output; reply-only update.", nil)
	}
	if p.Spec != "" {
		site.Spec = p.Spec
	}
	for _, pf := range p.Files {
		f := pf.toFile()
		if err := upsertSiteFile(&site, f); err != nil {
			logf("error", "Artifact file rejected by validator.", map[string]any{"name": f.Name, "error": err.Error()})
			writeSSE("error", map[string]string{"error": "agent artifact rejected: " + err.Error()})
			return
		}
		logf("info", "Accepted artifact file into site workspace.", map[string]any{"name": f.Name, "bytes": len(f.Text)})
	}
	if len(p.Tabs) > 0 {
		site.Tabs = p.Tabs
	}
	now := time.Now().UTC().Format(time.RFC3339)
	chat.Messages = append(chat.Messages,
		Message{Role: "user", Text: req.Message, At: now},
		Message{Role: "assistant", Text: p.Reply, At: now},
	)
	if chat.Title == "Nueva conversación" || chat.Title == "" {
		title := strings.TrimSpace(req.Message)
		if len(title) > 60 {
			title = title[:60] + "…"
		}
		chat.Title = title
	}
	logf("info", "Persisting site artifacts + chat messages to S3.", map[string]any{
		"files": len(site.Files), "messages": len(chat.Messages), "title": chat.Title,
	})
	if err := h.saveSite(r.Context(), email, site); err != nil {
		logf("error", "S3 site save failed after successful model reply.", map[string]any{"error": err.Error()})
		writeSSE("error", map[string]string{"error": err.Error()})
		return
	}
	if err := h.saveChat(r.Context(), email, chat); err != nil {
		logf("error", "S3 chat save failed after successful model reply.", map[string]any{"error": err.Error()})
		writeSSE("error", map[string]string{"error": err.Error()})
		return
	}
	logf("info", "Ask complete. Emitting done with saved chat + site.", nil)
	writeSSE("done", map[string]any{"chat": chat, "site": site})
}

func splitArtifacts(raw string) (markdown, artifactsJSON string) {
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, artifactsStart)
	if start < 0 {
		return raw, ""
	}
	markdown = strings.TrimSpace(raw[:start])
	rest := raw[start+len(artifactsStart):]
	end := strings.Index(rest, artifactsEnd)
	if end >= 0 {
		rest = rest[:end]
	}
	artifactsJSON = strings.TrimSpace(rest)
	if strings.HasPrefix(artifactsJSON, "```") {
		artifactsJSON = strings.TrimPrefix(artifactsJSON, "```json")
		artifactsJSON = strings.TrimPrefix(artifactsJSON, "```")
		artifactsJSON = strings.TrimSuffix(artifactsJSON, "```")
		artifactsJSON = strings.TrimSpace(artifactsJSON)
	}
	return markdown, artifactsJSON
}

func resolveAskModel(req askRequest) string {
	m := strings.TrimSpace(strings.ToLower(req.Model))
	switch m {
	case "deepseek-v4-flash", "deepseek-v4-pro":
		return m
	case "flash":
		return "deepseek-v4-flash"
	case "pro", "medium", "reasoner", "reasoning":
		return "deepseek-v4-pro"
	default:
		return httpx.Env("DEEPSEEK_MODEL_REASONING", "deepseek-v4-pro")
	}
}

func resolveThinking(req askRequest) string {
	t := strings.TrimSpace(strings.ToLower(req.Thinking))
	switch t {
	case "disabled", "off", "false", "flash":
		return "disabled"
	case "enabled", "on", "true", "reasoning":
		return "enabled"
	default:
		return "enabled"
	}
}

func resolveEffort(req askRequest) string {
	e := strings.TrimSpace(strings.ToLower(req.ReasoningEffort))
	switch e {
	case "low", "high", "max":
		return e
	case "medium":
		return "high"
	default:
		return "high"
	}
}

func deepSeekReasoningStream(ctx context.Context, model, thinking, effort, system, user string, onDelta func(string), onLog func(stage, msg string)) error {
	if onLog == nil {
		onLog = func(string, string) {}
	}
	key := strings.TrimSpace(httpx.Env("DEEPSEEK_API_KEY", ""))
	if key == "" {
		return fmt.Errorf("DEEPSEEK_API_KEY is not configured")
	}
	if model == "" {
		model = "deepseek-v4-pro"
	}
	if thinking != "disabled" {
		thinking = "enabled"
	}
	if effort == "" {
		effort = "high"
	}
	base := strings.TrimRight(httpx.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/")
	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"stream":   true,
		"thinking": map[string]string{"type": thinking},
	}
	if thinking == "enabled" {
		payload["reasoning_effort"] = effort
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	onLog("deepseek.request", fmt.Sprintf("POST %s/chat/completions model=%s thinking=%s effort=%s bodyBytes=%d", base, model, thinking, effort, len(body)))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	res, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return fmt.Errorf("DeepSeek request failed: %w", err)
	}
	defer res.Body.Close()
	onLog("deepseek.response", fmt.Sprintf("HTTP %d — reading SSE body", res.StatusCode))
	if res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("DeepSeek status %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	chunks := 0
	reasoningChunks := 0
	lastHeartbeat := time.Now()
	for scanner.Scan() {
		line := scanner.Text()
		if time.Since(lastHeartbeat) > 15*time.Second {
			onLog("deepseek.heartbeat", fmt.Sprintf("Still reading DeepSeek SSE… chunks=%d reasoning=%d", chunks, reasoningChunks))
			lastHeartbeat = time.Now()
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payloadLine := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payloadLine == "" || payloadLine == "[DONE]" {
			continue
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content          string `json:"content"`
					ReasoningContent string `json:"reasoning_content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(payloadLine), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		if rc := chunk.Choices[0].Delta.ReasoningContent; rc != "" {
			reasoningChunks++
			if reasoningChunks == 1 {
				onLog("deepseek.reasoning", "Model entered reasoning phase (thinking tokens; not shown in chat).")
			}
		}
		delta := chunk.Choices[0].Delta.Content
		if delta != "" {
			chunks++
			onDelta(delta)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("DeepSeek SSE read error: %w", err)
	}
	onLog("deepseek.done", fmt.Sprintf("SSE complete contentChunks=%d reasoningChunks=%d", chunks, reasoningChunks))
	return nil
}

func deepSeekReasoning(ctx context.Context, system, user string) (string, error) {
	var b strings.Builder
	err := deepSeekReasoningStream(ctx, "deepseek-v4-pro", "enabled", "high", system, user, func(delta string) { b.WriteString(delta) }, nil)
	return b.String(), err
}

type crawlRequest struct {
	URL       string   `json:"url"`
	Allowlist []string `json:"allowlist"`
}

// Crawl fetches one allowlisted HTTPS documentation URL.
func (h *Handler) Crawl(w http.ResponseWriter, r *http.Request) {
	var req crawlRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 32<<10)).Decode(&req); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid crawl request")
		return
	}
	text, err := crawl(r.Context(), req.URL, req.Allowlist)
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"url": req.URL, "text": text})
}

func crawl(ctx context.Context, raw string, allowlist []string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" {
		return "", fmt.Errorf("only HTTPS URLs are allowed")
	}
	host := strings.ToLower(u.Hostname())
	allowed := false
	for _, a := range allowlist {
		a = strings.ToLower(strings.TrimSpace(a))
		if host == a || strings.HasSuffix(host, "."+a) {
			allowed = true
		}
	}
	if !allowed {
		return "", fmt.Errorf("host is not in this request allowlist")
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return "", err
	}
	for _, ip := range ips {
		if ip.IP.IsPrivate() || ip.IP.IsLoopback() || ip.IP.IsLinkLocalUnicast() || ip.IP.IsUnspecified() {
			return "", fmt.Errorf("private network targets are blocked")
		}
	}
	client := &http.Client{
		Timeout: 12 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 2 {
				return fmt.Errorf("too many redirects")
			}
			if strings.ToLower(req.URL.Hostname()) != host {
				return fmt.Errorf("redirect host blocked")
			}
			return nil
		},
	}
	res, err := client.Get(u.String())
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("documentation returned status %d", res.StatusCode)
	}
	rawBody, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", err
	}
	return string(rawBody), nil
}
