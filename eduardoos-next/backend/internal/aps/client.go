package aps

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/httpx"
)

// Config holds Autodesk Platform Services credentials and endpoint overrides.
// Defaults match production Design Automation us-east v3 + auth v2.
type Config struct {
	ClientID     string
	ClientSecret string
	ActivityID   string
	TokenURL     string
	WorkItemsURL string
	OAuthScope   string
	DABaseURL    string
	DMBaseURL    string
}

// LoadConfig reads APS_* environment variables with production-like defaults.
func LoadConfig() Config {
	return Config{
		ClientID:     strings.TrimSpace(httpx.Env("APS_CLIENT_ID", "")),
		ClientSecret: strings.TrimSpace(httpx.Env("APS_CLIENT_SECRET", "")),
		ActivityID:   strings.TrimSpace(httpx.Env("APS_ACTIVITY_ID", "")),
		TokenURL:     strings.TrimSpace(httpx.Env("APS_TOKEN_URL", "https://developer.api.autodesk.com/authentication/v2/token")),
		WorkItemsURL: strings.TrimSpace(httpx.Env("APS_WORKITEMS_URL", "https://developer.api.autodesk.com/da/us-east/v3/workitems")),
		OAuthScope:   strings.TrimSpace(httpx.Env("APS_OAUTH_SCOPE", "code:all data:read data:write")),
		DABaseURL:    strings.TrimSpace(httpx.Env("APS_DA_BASE_URL", "https://developer.api.autodesk.com/da/us-east/v3")),
		DMBaseURL:    strings.TrimSpace(httpx.Env("APS_DM_BASE_URL", "https://developer.api.autodesk.com/project/v1")),
	}
}

// Validate returns an error when required credentials are missing.
func (c Config) Validate() error {
	var missing []string
	if c.ClientID == "" {
		missing = append(missing, "APS_CLIENT_ID")
	}
	if c.ClientSecret == "" {
		missing = append(missing, "APS_CLIENT_SECRET")
	}
	if c.ActivityID == "" {
		missing = append(missing, "APS_ACTIVITY_ID")
	}
	if len(missing) == 0 {
		return nil
	}
	return fmt.Errorf("aps config incomplete: missing %s", strings.Join(missing, ", "))
}

// Client talks to Autodesk APS (token + Design Automation + Data Management).
type Client struct {
	Cfg        Config
	HTTPClient *http.Client

	mu          sync.Mutex
	cachedToken string
	tokenExpiry time.Time
}

// NewClient builds a Client with a sensible HTTP timeout.
func NewClient(cfg Config) *Client {
	return &Client{
		Cfg:        cfg,
		HTTPClient: &http.Client{Timeout: 60 * time.Second},
	}
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
	TokenType   string `json:"token_type"`
}

// GetAccessToken fetches (and caches) a client_credentials OAuth token.
func (c *Client) GetAccessToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cachedToken != "" && time.Now().Before(c.tokenExpiry.Add(-60*time.Second)) {
		return c.cachedToken, nil
	}
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("scope", c.Cfg.OAuthScope)
	req, err := http.NewRequest(http.MethodPost, c.Cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(c.Cfg.ClientID, c.Cfg.ClientSecret)
	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("aps token status=%d body=%s", res.StatusCode, truncate(string(body), 400))
	}
	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", err
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("aps token response missing access_token")
	}
	exp := tr.ExpiresIn
	if exp <= 0 {
		exp = 3600
	}
	c.cachedToken = tr.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(exp) * time.Second)
	return c.cachedToken, nil
}

// CreateWorkItem POSTs a Design Automation workitem payload.
func (c *Client) CreateWorkItem(payload map[string]any) (map[string]any, error) {
	return c.authedJSON(http.MethodPost, c.Cfg.WorkItemsURL, payload)
}

// GetWorkItemStatus GETs a workitem by id from the WorkItemsURL base.
func (c *Client) GetWorkItemStatus(id string) (map[string]any, error) {
	u := strings.TrimRight(c.Cfg.WorkItemsURL, "/") + "/" + url.PathEscape(id)
	return c.authedJSON(http.MethodGet, u, nil)
}

// ListAppBundles hits DA /appbundles.
func (c *Client) ListAppBundles() (map[string]any, error) {
	return c.authedJSON(http.MethodGet, c.Cfg.DABaseURL+"/appbundles", nil)
}

// ListActivities hits DA /activities.
func (c *Client) ListActivities() (map[string]any, error) {
	return c.authedJSON(http.MethodGet, c.Cfg.DABaseURL+"/activities", nil)
}

// ListEngines hits DA /engines.
func (c *Client) ListEngines() (map[string]any, error) {
	return c.authedJSON(http.MethodGet, c.Cfg.DABaseURL+"/engines", nil)
}

// ListHubs hits Data Management hubs endpoint.
func (c *Client) ListHubs() (map[string]any, error) {
	return c.authedJSON(http.MethodGet, c.Cfg.DMBaseURL+"/hubs", nil)
}

// ListProjects lists projects under a hub.
func (c *Client) ListProjects(hubID string) (map[string]any, error) {
	u := fmt.Sprintf("%s/hubs/%s/projects", c.Cfg.DMBaseURL, url.PathEscape(hubID))
	return c.authedJSON(http.MethodGet, u, nil)
}

// ListFolderContents lists contents of a project folder via data API.
// Uses the standard Data Management projects/{projectId}/folders/{folderId}/contents path.
func (c *Client) ListFolderContents(projectID, folderID string) (map[string]any, error) {
	base := strings.TrimSpace(httpx.Env("APS_DATA_BASE_URL", "https://developer.api.autodesk.com/data/v1"))
	u := fmt.Sprintf("%s/projects/%s/folders/%s/contents",
		base, url.PathEscape(projectID), url.PathEscape(folderID))
	return c.authedJSON(http.MethodGet, u, nil)
}

func (c *Client) authedJSON(method, endpoint string, payload map[string]any) (map[string]any, error) {
	token, err := c.GetAccessToken()
	if err != nil {
		return nil, err
	}
	var bodyReader io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		bodyReader = strings.NewReader(string(b))
	}
	req, err := http.NewRequest(method, endpoint, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("aps %s %s status=%d body=%s", method, endpoint, res.StatusCode, truncate(string(raw), 500))
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return map[string]any{}, nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
