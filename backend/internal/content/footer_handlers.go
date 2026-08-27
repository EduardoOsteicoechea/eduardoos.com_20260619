package content

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// CopyEpam duplicates a cloud pamphlet: new UUID, same body, title + "_n".
func (h *Handler) CopyEpam(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	sourceID := strings.TrimSpace(chi.URLParam(r, "id"))
	if sourceID == "" {
		httpx.WriteError(w, http.StatusBadRequest, "epamId required")
		return
	}

	src, ok, err := h.Epams.Get(r.Context(), email, sourceID, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	h.applyLinkedFooter(r, &src, cid)

	listed, err := h.Epams.ListByUser(r.Context(), email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	sourceTitle := strings.TrimSpace(src.Title)
	if sourceTitle == "" {
		sourceTitle = strings.TrimSpace(src.FileName)
	}
	if sourceTitle == "" {
		sourceTitle = sourceID
	}
	newTitle := NextCopyTitle(sourceTitle, titlesFromEpams(listed))

	body, err := cloneBodyMap(src.Body)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not clone pamphlet body")
		return
	}
	newID := uuid.NewString()
	body["id"] = newID
	setHeaderTitle(body, newTitle)

	copyRec := EpamRecord{
		UserID:        email,
		EpamID:        newID,
		FileName:      sanitizeEpamFileName(newTitle),
		Title:         newTitle,
		Series:        src.Series,
		SeriesChapter: src.SeriesChapter,
		Author:        src.Author,
		Date:          src.Date,
		Body:          body,
	}
	syncEpamMetaFromHeader(&copyRec)

	saved, err := h.Epams.Save(r.Context(), copyRec, cid)
	if err != nil {
		log.Printf("[correlation=%s] epams.copy failed user=%s source=%s err=%v", cid, email, sourceID, err)
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	log.Printf("[correlation=%s] epams.copy user=%s source=%s newId=%s title=%q", cid, email, sourceID, saved.EpamID, saved.Title)
	httpx.WriteJSON(w, http.StatusCreated, epamDocumentResponse(saved))
}

func (h *Handler) footerStore() FooterStore {
	if h.Footers != nil {
		return h.Footers
	}
	return NewMemoryFooterStore()
}

func (h *Handler) applyLinkedFooter(r *http.Request, rec *EpamRecord, cid string) {
	applyLinkedFooter(r.Context(), rec, h.footerStore(), cid)
}

type footerWriteBody struct {
	Name   string       `json:"name"`
	Footer FooterFields `json:"footer"`
}

func (h *Handler) ListFooters(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	out, err := h.footerStore().ListByUser(r.Context(), email, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if out == nil {
		out = []FooterProfile{}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].FooterID < out[j].FooterID
	})
	log.Printf("[correlation=%s] epams.footer.list user=%s count=%d", cid, email, len(out))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count":   len(out),
		"footers": out,
	})
}

func (h *Handler) CreateFooter(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	var body footerWriteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	saved, err := h.footerStore().Save(r.Context(), FooterProfile{
		UserID: email,
		Name:   name,
		Footer: body.Footer,
	}, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	log.Printf("[correlation=%s] epams.footer.save user=%s footerId=%s", cid, email, saved.FooterID)
	httpx.WriteJSON(w, http.StatusCreated, saved)
}

func (h *Handler) UpdateFooter(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "footerId required")
		return
	}
	existing, ok, err := h.footerStore().Get(r.Context(), email, id, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	var body footerWriteBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if name := strings.TrimSpace(body.Name); name != "" {
		existing.Name = name
	}
	existing.Footer = body.Footer
	saved, err := h.footerStore().Save(r.Context(), existing, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	log.Printf("[correlation=%s] epams.footer.save user=%s footerId=%s", cid, email, saved.FooterID)
	httpx.WriteJSON(w, http.StatusOK, saved)
}

func (h *Handler) DeleteFooter(w http.ResponseWriter, r *http.Request) {
	email := auth.UserEmailFromRequest(r)
	cid := httpx.CorrelationFromRequest(r)
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		httpx.WriteError(w, http.StatusBadRequest, "footerId required")
		return
	}
	_, ok, err := h.footerStore().Get(r.Context(), email, id, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not found")
		return
	}
	if err := h.footerStore().Delete(r.Context(), email, id, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	log.Printf("[correlation=%s] epams.footer.delete user=%s footerId=%s", cid, email, id)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "footerId": id})
}
