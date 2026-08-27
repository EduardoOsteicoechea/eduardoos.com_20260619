package content

// Public article routes: list and read cloud pamphlets as linear articles
// optimized for humans and AI crawlers (plain text + semantic HTML + JSON-LD).

import (
	"html"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/pkg/article"

	"github.com/go-chi/chi/v5"
)

// publicArticlesUserID is the owner whose pamphlets appear on /articulos when
// the request has no JWT. Override with PUBLIC_ARTICLES_USER_ID.
func publicArticlesUserID() string {
	return strings.TrimSpace(httpx.Env("PUBLIC_ARTICLES_USER_ID", "eduardooost@gmail.com"))
}

// articleOwnerEmail resolves which user's epams to read: Bearer subject when
// present, otherwise the public owner account.
func (h *Handler) articleOwnerEmail(r *http.Request) string {
	if email, err := auth.EmailFromBearer(r.Header.Get("Authorization"), h.JWTSecret); err == nil && strings.TrimSpace(email) != "" {
		return strings.TrimSpace(email)
	}
	return publicArticlesUserID()
}

// ListArticlesHTML serves a crawlable HTML index of public pamphlets.
func (h *Handler) ListArticlesHTML(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := h.articleOwnerEmail(r)
	records, err := h.Epams.ListByUser(r.Context(), owner, cid)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "could not load articles")
		return
	}
	base := strings.TrimRight(os.Getenv("PUBLIC_SITE_URL"), "/")
	if base == "" {
		base = "https://eduardoos.com"
	}
	tree := BuildSeriesTree(records)
	var body strings.Builder
	body.WriteString("<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n")
	body.WriteString("<meta name=\"robots\" content=\"index,follow\">\n")
	body.WriteString("<title>Articles — Eduardo OS</title>\n")
	body.WriteString("<link rel=\"canonical\" href=\"")
	body.WriteString(html.EscapeString(base + "/articulos"))
	body.WriteString("\">\n</head>\n<body>\n<main>\n")
	body.WriteString("<h1>Articles (pamphlets)</h1>\n")
	body.WriteString("<p>Linear reading copies of cloud pamphlets, grouped by series and chapter. Machine formats: ")
	body.WriteString("<a href=\"/api/articles\">JSON</a>, ")
	body.WriteString("<a href=\"/llms.txt\">llms.txt</a>.</p>\n")
	writeArticlesSeriesHTML(&body, tree, base)
	body.WriteString("</main>\n</body>\n</html>\n")
	log.Printf("[correlation=%s] articles.list_html ok owner=%s count=%d series=%d", cid, owner, tree.Count, len(tree.Series))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "index, follow")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(body.String()))
}

// ListArticles returns pamphlet metadata for the resolved owner (public by default).
func (h *Handler) ListArticles(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := h.articleOwnerEmail(r)
	records, err := h.Epams.ListByUser(r.Context(), owner, cid)
	if err != nil {
		log.Printf("[correlation=%s] articles.list failed owner=%s err=%v", cid, owner, err)
		httpx.WriteError(w, http.StatusInternalServerError, "could not load articles")
		return
	}
	if records == nil {
		records = []EpamRecord{}
	}
	// Strip in-memory bodies from list payloads.
	out := make([]EpamRecord, 0, len(records))
	for _, rec := range records {
		rec.Body = nil
		out = append(out, rec)
	}
	log.Printf("[correlation=%s] articles.list ok owner=%s count=%d", cid, owner, len(out))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"count":    len(out),
		"articles": out,
		"owner":    owner,
		"public":   owner == publicArticlesUserID() && r.Header.Get("Authorization") == "",
	})
}

func (h *Handler) loadArticleRecord(r *http.Request, epamID string) (EpamRecord, string, error) {
	cid := httpx.CorrelationFromRequest(r)
	epamID = strings.TrimSpace(epamID)
	if epamID == "" {
		return EpamRecord{}, "", errArticleBadRequest
	}
	owner := h.articleOwnerEmail(r)
	rec, ok, err := h.Epams.Get(r.Context(), owner, epamID, cid)
	if err != nil {
		return EpamRecord{}, owner, err
	}
	if ok {
		h.applyLinkedFooter(r, &rec, cid)
		return rec, owner, nil
	}
	// Signed-in users may still open a public pamphlet by id.
	pub := publicArticlesUserID()
	if owner != pub {
		rec, ok, err = h.Epams.Get(r.Context(), pub, epamID, cid)
		if err != nil {
			return EpamRecord{}, pub, err
		}
		if ok {
			h.applyLinkedFooter(r, &rec, cid)
			return rec, pub, nil
		}
	}
	return EpamRecord{}, owner, errArticleNotFound
}

var (
	errArticleNotFound   = errString("article not found")
	errArticleBadRequest = errString("epamId required")
)

type errString string

func (e errString) Error() string { return string(e) }

func (h *Handler) articlePayload(rec EpamRecord) (map[string]any, article.PamphletLite, string, error) {
	doc, err := article.ParsePamphletMap(rec.Body)
	if err != nil {
		return nil, article.PamphletLite{}, "", err
	}
	blocks := article.BlocksInReadingOrder(doc)
	plain := article.PlainText(doc)
	hash := article.ContentHash(plain)
	title := strings.TrimSpace(doc.Header.Title)
	if title == "" {
		title = strings.TrimSpace(rec.Title)
	}
	if title == "" {
		title = "Untitled"
	}
	meta := rec
	meta.Body = nil
	return map[string]any{
		"meta":        meta,
		"blocks":      blocks,
		"contentHash": hash,
		"title":       title,
		"plainText":   plain,
	}, doc, plain, nil
}

// GetArticle returns flattened blocks + plainText for one pamphlet (public).
func (h *Handler) GetArticle(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	id := chi.URLParam(r, "id")
	rec, owner, err := h.loadArticleRecord(r, id)
	if err != nil {
		status := http.StatusInternalServerError
		msg := "could not load article"
		if err == errArticleNotFound {
			status = http.StatusNotFound
			msg = err.Error()
		} else if err == errArticleBadRequest {
			status = http.StatusBadRequest
			msg = err.Error()
		}
		log.Printf("[correlation=%s] articles.get failed id=%s err=%v", cid, id, err)
		httpx.WriteError(w, status, msg)
		return
	}
	payload, _, _, err := h.articlePayload(rec)
	if err != nil {
		log.Printf("[correlation=%s] articles.get parse failed id=%s err=%v", cid, id, err)
		httpx.WriteError(w, http.StatusBadGateway, "stored pamphlet is invalid or empty")
		return
	}
	log.Printf("[correlation=%s] articles.get ok owner=%s id=%s", cid, owner, id)
	httpx.WriteJSON(w, http.StatusOK, payload)
}

// GetArticleText serves text/plain for crawlers that prefer raw markdown-like text.
func (h *Handler) GetArticleText(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	id := chi.URLParam(r, "id")
	rec, _, err := h.loadArticleRecord(r, id)
	if err != nil {
		status := http.StatusInternalServerError
		if err == errArticleNotFound {
			status = http.StatusNotFound
		} else if err == errArticleBadRequest {
			status = http.StatusBadRequest
		}
		httpx.WriteError(w, status, err.Error())
		return
	}
	_, _, plain, err := h.articlePayload(rec)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "stored pamphlet is invalid or empty")
		return
	}
	log.Printf("[correlation=%s] articles.text ok id=%s bytes=%d", cid, id, len(plain))
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "index, follow")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(plain))
}

// GetArticleHTML serves a semantic HTML document (JSON-LD Article) for AI crawlers.
func (h *Handler) GetArticleHTML(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	id := chi.URLParam(r, "id")
	rec, _, err := h.loadArticleRecord(r, id)
	if err != nil {
		status := http.StatusInternalServerError
		if err == errArticleNotFound {
			status = http.StatusNotFound
		} else if err == errArticleBadRequest {
			status = http.StatusBadRequest
		}
		httpx.WriteError(w, status, err.Error())
		return
	}
	payload, _, plain, err := h.articlePayload(rec)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "stored pamphlet is invalid or empty")
		return
	}
	title, _ := payload["title"].(string)
	blocks, _ := payload["blocks"].([]article.Block)
	base := strings.TrimRight(os.Getenv("PUBLIC_SITE_URL"), "/")
	if base == "" {
		base = "https://eduardoos.com"
	}
	canonical := base + "/articulos/ver?id=" + id
	htmlDoc := article.RenderHTML(title, canonical, plain, blocks)
	log.Printf("[correlation=%s] articles.html ok id=%s bytes=%d", cid, id, len(htmlDoc))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "index, follow, max-snippet:-1")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(htmlDoc))
}

// writeArticlesSeriesHTML nests series → chapter → pamphlet links for crawlers.
func writeArticlesSeriesHTML(body *strings.Builder, tree SeriesTreeResponse, base string) {
	if tree.Count == 0 {
		body.WriteString("<p>No public pamphlets yet.</p>\n")
		return
	}
	body.WriteString("<ul>\n")
	for _, series := range tree.Series {
		body.WriteString("<li><strong>")
		body.WriteString(html.EscapeString(series.Name))
		body.WriteString("</strong>\n<ul>\n")
		for _, ch := range series.Chapters {
			body.WriteString("<li>")
			body.WriteString(html.EscapeString(ch.Name))
			body.WriteString("\n<ul>\n")
			for _, item := range ch.Items {
				id := url.PathEscape(item.EpamID)
				body.WriteString("<li><a href=\"")
				body.WriteString(html.EscapeString(base + "/articulos/ver?id=" + item.EpamID))
				body.WriteString("\">")
				body.WriteString(html.EscapeString(item.Title))
				body.WriteString("</a> — <a href=\"/api/articles/")
				body.WriteString(id)
				body.WriteString("/html\">HTML</a> · <a href=\"/api/articles/")
				body.WriteString(id)
				body.WriteString("/text\">text</a> · <a href=\"/api/articles/")
				body.WriteString(id)
				body.WriteString("\">JSON</a></li>\n")
			}
			body.WriteString("</ul></li>\n")
		}
		body.WriteString("</ul></li>\n")
	}
	body.WriteString("</ul>\n")
}
