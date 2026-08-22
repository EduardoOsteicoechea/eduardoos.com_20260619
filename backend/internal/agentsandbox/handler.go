// Package agentsandbox provides the admin-only, S3-backed static-site agent
// workspace. It deliberately has no local-file or command-execution APIs.
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
	"strings"
	"time"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/go-chi/chi/v5"
)

const rootPrefix = "agentsandbox"
const maxFileBytes = 512 << 10

var validName = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$`)
var allowedExtensions = map[string]string{
	".html": "text/html", ".css": "text/css", ".js": "text/javascript",
	".json": "application/json", ".txt": "text/plain", ".svg": "image/svg+xml",
}

type Message struct {
	Role string `json:"role"`
	Text string `json:"text"`
	At   string `json:"at"`
}
type File struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Text string `json:"text"`
}
type Tab struct {
	ID string `json:"id"`
	Label string `json:"label"`
	File string `json:"file"`
}
type Manifest struct {
	Version  int       `json:"version"`
	Spec     string    `json:"spec"`
	Messages []Message `json:"messages"`
	Files    []File    `json:"files"`
	Tabs     []Tab     `json:"tabs"`
	Updated  string    `json:"updated"`
}
type Handler struct {
	JWTSecret string
	Users     auth.UserStore
	auth      *auth.Handler
	s3        *s3.Client
	bucket    string
}

func NewHandler(ctx context.Context, jwtSecret string, users auth.UserStore) *Handler {
	h := &Handler{JWTSecret: jwtSecret, Users: users, auth: &auth.Handler{JWTSecret: jwtSecret, Store: users}, bucket: strings.TrimSpace(httpx.Env("S3_BUCKET", ""))}
	if h.bucket != "" {
		if cfg, err := awsx.LoadConfig(ctx); err == nil {
			h.s3 = s3.NewFromConfig(cfg)
		}
	}
	return h
}

func (h *Handler) Routes(r chi.Router) {
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireJWT)
		r.Use(h.requireAdmin)
		r.Get("/api/admin/agent-sandbox/workspace", h.GetWorkspace)
		r.Post("/api/admin/agent-sandbox/files", h.PutFile)
		r.Post("/api/admin/agent-sandbox/ask", h.Ask)
		r.Post("/api/admin/agent-sandbox/crawl", h.Crawl)
	})
}

func (h *Handler) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email := auth.UserEmailFromRequest(r)
		role := auth.RoleUser
		if h.Users != nil {
			if u, ok, err := h.Users.GetUser(r.Context(), email); err == nil && ok { role = u.Role }
		}
		if !auth.IsAdmin(email, role) { httpx.WriteError(w, http.StatusForbidden, "admin only"); return }
		next.ServeHTTP(w, r)
	})
}
func safeEmail(email string) string { return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(email)), "@", "_at_") }
func (h *Handler) key(email string) string { return rootPrefix + "/" + safeEmail(email) + "/manifest.json" }
func emptyManifest() Manifest { return Manifest{Version: 1, Messages: []Message{}, Files: []File{}, Tabs: []Tab{}, Updated: time.Now().UTC().Format(time.RFC3339)} }

func (h *Handler) load(ctx context.Context, email string) (Manifest, error) {
	if h.s3 == nil || h.bucket == "" { return Manifest{}, fmt.Errorf("agentsandbox S3 is not configured") }
	out, err := h.s3.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(h.bucket), Key: aws.String(h.key(email))})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "nosuchkey") || strings.Contains(err.Error(), "404") { return emptyManifest(), nil }
		return Manifest{}, err
	}
	defer out.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(out.Body, 2<<20)); if err != nil { return Manifest{}, err }
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil { return Manifest{}, err }
	if m.Version == 0 { m.Version = 1 }
	return m, nil
}
func (h *Handler) save(ctx context.Context, email string, m Manifest) error {
	m.Updated = time.Now().UTC().Format(time.RFC3339)
	raw, err := json.Marshal(m); if err != nil { return err }
	_, err = h.s3.PutObject(ctx, &s3.PutObjectInput{Bucket: aws.String(h.bucket), Key: aws.String(h.key(email)), Body: bytes.NewReader(raw), ContentType: aws.String("application/json")})
	return err
}
func (h *Handler) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	m, err := h.load(r.Context(), auth.UserEmailFromRequest(r))
	if err != nil { httpx.WriteError(w, http.StatusBadGateway, err.Error()); return }
	httpx.WriteJSON(w, http.StatusOK, m)
}
func validateFile(f File) error {
	f.Name = strings.TrimSpace(f.Name)
	ext := strings.ToLower(path.Ext(f.Name))
	if !validName.MatchString(f.Name) || strings.Count(f.Name, ".") > 1 || allowedExtensions[ext] == "" { return fmt.Errorf("unsupported file name or type") }
	if len(f.Text) > maxFileBytes { return fmt.Errorf("file exceeds 512 KiB") }
	if ext == ".svg" {
		lower := strings.ToLower(f.Text)
		if strings.Contains(lower, "<script") || strings.Contains(lower, "foreignobject") || strings.Contains(lower, "onload=") || strings.Contains(lower, "onclick=") { return fmt.Errorf("unsafe SVG") }
	}
	return nil
}
func upsertFile(m *Manifest, f File) error {
	if err := validateFile(f); err != nil { return err }
	f.Type = allowedExtensions[strings.ToLower(path.Ext(f.Name))]
	for i := range m.Files { if m.Files[i].Name == f.Name { m.Files[i] = f; return nil } }
	if len(m.Files) >= 40 { return fmt.Errorf("workspace file limit reached") }
	m.Files = append(m.Files, f); return nil
}
func (h *Handler) PutFile(w http.ResponseWriter, r *http.Request) {
	var f File
	if err := json.NewDecoder(io.LimitReader(r.Body, maxFileBytes+2048)).Decode(&f); err != nil { httpx.WriteError(w, 400, "invalid file"); return }
	email := auth.UserEmailFromRequest(r); m, err := h.load(r.Context(), email)
	if err == nil { err = upsertFile(&m, f) }; if err == nil { err = h.save(r.Context(), email, m) }
	if err != nil { httpx.WriteError(w, 400, err.Error()); return }; httpx.WriteJSON(w, 200, m)
}

type askRequest struct { Message string `json:"message"`; Allowlist []string `json:"allowlist"` }
type proposal struct { Reply string `json:"reply"`; Spec string `json:"spec"`; Files []File `json:"files"`; Tabs []Tab `json:"tabs"` }
func (h *Handler) Ask(w http.ResponseWriter, r *http.Request) {
	var req askRequest; if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&req); err != nil || strings.TrimSpace(req.Message) == "" { httpx.WriteError(w, 400, "message required"); return }
	email := auth.UserEmailFromRequest(r); m, err := h.load(r.Context(), email); if err != nil { httpx.WriteError(w, 502, err.Error()); return }
	system := `You are an AI senior web developer and web crawler architect. Return ONLY JSON with reply, spec, files and tabs. First refine the workspace spec, then propose static artifacts. You may only propose .html,.css,.js,.json,.txt,.svg files. Never propose shell commands, filesystem access, network requests, credentials, or server code. Use one minimal global CSS with rem sizes.`
	user := fmt.Sprintf("Workspace spec:\n%s\nRequest:\n%s\nAllowed docs hosts for this request: %s", m.Spec, req.Message, strings.Join(req.Allowlist, ", "))
	reply, err := deepSeekReasoning(r.Context(), system, user)
	if err != nil { httpx.WriteError(w, 502, err.Error()); return }
	var p proposal
	if err := json.Unmarshal([]byte(reply), &p); err != nil { p.Reply = reply }
	if p.Spec != "" { m.Spec = p.Spec }
	for _, f := range p.Files { if err := upsertFile(&m, f); err != nil { httpx.WriteError(w, 400, "agent artifact rejected: "+err.Error()); return } }
	if len(p.Tabs) > 0 { m.Tabs = p.Tabs }
	m.Messages = append(m.Messages, Message{Role: "user", Text: req.Message, At: time.Now().UTC().Format(time.RFC3339)}, Message{Role: "assistant", Text: p.Reply, At: time.Now().UTC().Format(time.RFC3339)})
	if err := h.save(r.Context(), email, m); err != nil { httpx.WriteError(w, 502, err.Error()); return }; httpx.WriteJSON(w, 200, m)
}

func deepSeekReasoning(ctx context.Context, system, user string) (string, error) {
	key := strings.TrimSpace(httpx.Env("DEEPSEEK_API_KEY", "")); if key == "" { return "", fmt.Errorf("DEEPSEEK_API_KEY is not configured") }
	body, _ := json.Marshal(map[string]any{"model": httpx.Env("DEEPSEEK_MODEL_REASONING", "deepseek-reasoner"), "messages": []map[string]string{{"role":"system","content":system},{"role":"user","content":user}}, "stream":false, "thinking":map[string]string{"type":"enabled"}})
	req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(httpx.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/")+"/chat/completions", bytes.NewReader(body)); if err != nil { return "", err }
	req.Header.Set("Authorization", "Bearer "+key); req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 55*time.Second}).Do(req); if err != nil { return "", err }; defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 2<<20)); if res.StatusCode >= 300 { return "", fmt.Errorf("DeepSeek status %d", res.StatusCode) }
	var parsed struct { Choices []struct { Message struct { Content string `json:"content"` } `json:"message"` } `json:"choices"` }; if err := json.Unmarshal(raw, &parsed); err != nil || len(parsed.Choices)==0 { return "", fmt.Errorf("invalid DeepSeek response") }
	return parsed.Choices[0].Message.Content, nil
}

type crawlRequest struct { URL string `json:"url"`; Allowlist []string `json:"allowlist"` }
func (h *Handler) Crawl(w http.ResponseWriter, r *http.Request) {
	var req crawlRequest; if err:=json.NewDecoder(io.LimitReader(r.Body, 32<<10)).Decode(&req); err!=nil { httpx.WriteError(w,400,"invalid crawl request"); return }
	text, err := crawl(r.Context(), req.URL, req.Allowlist); if err != nil { httpx.WriteError(w, 400, err.Error()); return }
	httpx.WriteJSON(w, 200, map[string]string{"url":req.URL, "text":text})
}
func crawl(ctx context.Context, raw string, allowlist []string) (string,error) {
	u,err:=url.Parse(raw); if err!=nil||u.Scheme!="https"||u.Hostname()=="" { return "",fmt.Errorf("only HTTPS URLs are allowed") }
	host:=strings.ToLower(u.Hostname()); allowed:=false; for _,a:=range allowlist { a=strings.ToLower(strings.TrimSpace(a)); if host==a||strings.HasSuffix(host,"."+a) {allowed=true} }; if !allowed {return "",fmt.Errorf("host is not in this request allowlist")}
	ips,err:=net.DefaultResolver.LookupIPAddr(ctx,host); if err!=nil{return "",err}; for _,ip:=range ips {if ip.IP.IsPrivate()||ip.IP.IsLoopback()||ip.IP.IsLinkLocalUnicast()||ip.IP.IsUnspecified(){return "",fmt.Errorf("private network targets are blocked")}}
	client:=&http.Client{Timeout:12*time.Second,CheckRedirect:func(req *http.Request,via []*http.Request) error{if len(via)>2{return fmt.Errorf("too many redirects")};if strings.ToLower(req.URL.Hostname())!=host{return fmt.Errorf("redirect host blocked")};return nil}}
	res,err:=client.Get(u.String());if err!=nil{return "",err};defer res.Body.Close();if res.StatusCode>=300{return "",fmt.Errorf("documentation returned status %d",res.StatusCode)};rawBody,err:=io.ReadAll(io.LimitReader(res.Body,1<<20));if err!=nil{return "",err};return string(rawBody),nil
}
