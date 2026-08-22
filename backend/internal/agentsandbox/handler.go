// Package agentsandbox is the admin-only Agent Sandbox: DeepSeek reasoning
// chat that proposes static website artifacts stored only under
// agentsandbox/{adminSafe}/ on S3. No local disk writes and no shell.
package agentsandbox

import (
	"bytes"
	"context"
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
	maxFileBytes = 512 << 10
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
}

// Message is one chat turn.
type Message struct {
	Role string `json:"role"`
	Text string `json:"text"`
	At   string `json:"at"`
}

// File is a static website artifact.
type File struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Text string `json:"text"`
}

// Tab is a preview tab pointing at an HTML file.
type Tab struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	File  string `json:"file"`
}

// Chat is one conversation + generated site, persisted as JSON on S3.
type Chat struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Spec     string    `json:"spec"`
	Messages []Message `json:"messages"`
	Files    []File    `json:"files"`
	Tabs     []Tab     `json:"tabs"`
	Updated  string    `json:"updated"`
}

// ChatSummary is a lightweight row for the history list.
type ChatSummary struct {
	ID      string `json:"id"`
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
		pr.Get("/api/admin/agent-sandbox/chats", h.ListChats)
		pr.Post("/api/admin/agent-sandbox/chats", h.CreateChat)
		pr.Get("/api/admin/agent-sandbox/chats/{id}", h.GetChat)
		pr.Delete("/api/admin/agent-sandbox/chats/{id}", h.DeleteChat)
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

func emptyChat(id string) Chat {
	now := time.Now().UTC().Format(time.RFC3339)
	return Chat{
		ID:       id,
		Title:    "Nueva conversación",
		Spec:     "",
		Messages: []Message{},
		Files:    []File{},
		Tabs:     []Tab{},
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
	if chat.Files == nil {
		chat.Files = []File{}
	}
	if chat.Tabs == nil {
		chat.Tabs = []Tab{}
	}
	return chat, nil
}

func (h *Handler) saveChat(ctx context.Context, email string, chat Chat) error {
	chat.Updated = time.Now().UTC().Format(time.RFC3339)
	if err := h.putJSON(ctx, h.chatKey(email, chat.ID), chat); err != nil {
		return err
	}
	idx, err := h.loadIndex(ctx, email)
	if err != nil {
		return err
	}
	found := false
	for i := range idx.Chats {
		if idx.Chats[i].ID == chat.ID {
			idx.Chats[i] = ChatSummary{ID: chat.ID, Title: chat.Title, Updated: chat.Updated}
			found = true
			break
		}
	}
	if !found {
		idx.Chats = append(idx.Chats, ChatSummary{ID: chat.ID, Title: chat.Title, Updated: chat.Updated})
	}
	return h.saveIndex(ctx, email, idx)
}

// ListChats returns conversation summaries.
func (h *Handler) ListChats(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	idx, err := h.loadIndex(r.Context(), auth.UserEmailFromRequest(r))
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, idx)
}

// CreateChat starts an empty conversation JSON on S3.
func (h *Handler) CreateChat(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	email := auth.UserEmailFromRequest(r)
	chat := emptyChat(uuid.NewString())
	if err := h.saveChat(r.Context(), email, chat); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
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
	httpx.WriteJSON(w, http.StatusOK, chat)
}

// DeleteChat removes a conversation JSON and its index row.
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
	if err := h.deleteKey(r.Context(), h.chatKey(email, id)); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	idx, err := h.loadIndex(r.Context(), email)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	next := make([]ChatSummary, 0, len(idx.Chats))
	for _, row := range idx.Chats {
		if row.ID != id {
			next = append(next, row)
		}
	}
	idx.Chats = next
	if err := h.saveIndex(r.Context(), email, idx); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func validateFile(f File) error {
	f.Name = strings.TrimSpace(f.Name)
	ext := strings.ToLower(path.Ext(f.Name))
	if !validName.MatchString(f.Name) || strings.Count(f.Name, ".") != 1 || allowedExtensions[ext] == "" {
		return fmt.Errorf("unsupported file name or type")
	}
	if len(f.Text) > maxFileBytes {
		return fmt.Errorf("file exceeds 512 KiB")
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

func upsertFile(chat *Chat, f File) error {
	if err := validateFile(f); err != nil {
		return err
	}
	f.Type = allowedExtensions[strings.ToLower(path.Ext(f.Name))]
	for i := range chat.Files {
		if chat.Files[i].Name == f.Name {
			chat.Files[i] = f
			return nil
		}
	}
	if len(chat.Files) >= maxFiles {
		return fmt.Errorf("workspace file limit reached")
	}
	chat.Files = append(chat.Files, f)
	return nil
}

// PutFile stores an admin-dropped artifact into the chat JSON.
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
	if err := upsertFile(&chat, f); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.saveChat(r.Context(), email, chat); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, chat)
}

// ListFiles returns the website file structure for a chat.
func (h *Handler) ListFiles(w http.ResponseWriter, r *http.Request) {
	if err := h.ensureS3(); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	chat, err := h.loadChat(r.Context(), auth.UserEmailFromRequest(r), chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	type row struct {
		Name string `json:"name"`
		Type string `json:"type"`
		Bytes int   `json:"bytes"`
	}
	out := make([]row, 0, len(chat.Files))
	for _, f := range chat.Files {
		out = append(out, row{Name: f.Name, Type: f.Type, Bytes: len(f.Text)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"chatId": chat.ID, "files": out})
}

type askRequest struct {
	Message   string   `json:"message"`
	Allowlist []string `json:"allowlist"`
}

type proposal struct {
	Reply string `json:"reply"`
	Spec  string `json:"spec"`
	Files []File `json:"files"`
	Tabs  []Tab  `json:"tabs"`
}

// Ask runs a DeepSeek reasoning turn and merges validated artifacts.
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
	chat, err := h.loadChat(r.Context(), email, chi.URLParam(r, "id"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, err.Error())
		return
	}
	system := `You are an AI senior web developer and web crawler architect. Return ONLY JSON with keys reply, spec, files, tabs. First refine the workspace spec, then propose static artifacts. You may only propose .html,.css,.js,.json,.txt,.svg files with flat names. Never propose shell commands, filesystem access, network requests, credentials, or server code. Use one minimal global CSS with rem sizes.`
	user := fmt.Sprintf("Workspace spec:\n%s\nRequest:\n%s\nAllowed docs hosts: %s", chat.Spec, req.Message, strings.Join(req.Allowlist, ", "))
	reply, err := deepSeekReasoning(r.Context(), system, user)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	var p proposal
	raw := strings.TrimSpace(reply)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```")
		raw = strings.TrimSuffix(raw, "```")
		raw = strings.TrimSpace(raw)
	}
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		p.Reply = reply
	}
	if p.Reply == "" {
		p.Reply = reply
	}
	if p.Spec != "" {
		chat.Spec = p.Spec
	}
	for _, f := range p.Files {
		if err := upsertFile(&chat, f); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "agent artifact rejected: "+err.Error())
			return
		}
	}
	if len(p.Tabs) > 0 {
		chat.Tabs = p.Tabs
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
	if err := h.saveChat(r.Context(), email, chat); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, chat)
}

func deepSeekReasoning(ctx context.Context, system, user string) (string, error) {
	key := strings.TrimSpace(httpx.Env("DEEPSEEK_API_KEY", ""))
	if key == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY is not configured")
	}
	body, err := json.Marshal(map[string]any{
		"model": httpx.Env("DEEPSEEK_MODEL_REASONING", "deepseek-reasoner"),
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"stream":   false,
		"thinking": map[string]string{"type": "enabled"},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		strings.TrimRight(httpx.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/")+"/chat/completions",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 55 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("DeepSeek status %d", res.StatusCode)
	}
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Choices) == 0 {
		return "", fmt.Errorf("invalid DeepSeek response")
	}
	return parsed.Choices[0].Message.Content, nil
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
