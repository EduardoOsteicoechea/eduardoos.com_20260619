package aps

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

type WorkItemArgument struct {
	URL  string `json:"url"`
	Verb string `json:"verb"`
}

type WorkItemRequest struct {
	ActivityID string                      `json:"activityId"`
	Arguments  map[string]WorkItemArgument `json:"arguments"`
}

type Client struct {
	cfg        Config
	httpClient *http.Client

	mu          sync.Mutex
	accessToken string
	tokenExpiry time.Time
}

func NewClient(cfg Config, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{cfg: cfg, httpClient: httpClient}
}

func (c *Client) GetAccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.accessToken != "" && time.Now().Before(c.tokenExpiry.Add(-30*time.Second)) {
		return c.accessToken, nil
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("scope", c.cfg.OAuthScope)
	form.Set("client_id", c.cfg.ClientID)
	form.Set("client_secret", c.cfg.ClientSecret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("aps token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("aps token call: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("aps token status=%d body=%s", resp.StatusCode, truncate(string(body), 400))
	}

	var tok TokenResponse
	if err := json.Unmarshal(body, &tok); err != nil {
		return "", fmt.Errorf("aps token decode: %w", err)
	}
	if strings.TrimSpace(tok.AccessToken) == "" {
		return "", fmt.Errorf("aps token missing access_token")
	}
	expiresIn := tok.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	c.accessToken = tok.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(expiresIn) * time.Second)
	return c.accessToken, nil
}

func (c *Client) CreateWorkItem(ctx context.Context, payload WorkItemRequest) (map[string]any, int, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return nil, 0, err
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, fmt.Errorf("aps workitem encode: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.WorkItemsURL, strings.NewReader(string(raw)))
	if err != nil {
		return nil, 0, fmt.Errorf("aps workitem request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("aps workitem call: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var decoded map[string]any
	if len(body) > 0 {
		_ = json.Unmarshal(body, &decoded)
	}
	if decoded == nil {
		decoded = map[string]any{"raw": string(body)}
	}
	if resp.StatusCode >= 400 {
		return decoded, resp.StatusCode, fmt.Errorf("aps workitem status=%d body=%s", resp.StatusCode, truncate(string(body), 600))
	}
	return decoded, resp.StatusCode, nil
}

func (c *Client) GetWorkItemStatus(ctx context.Context, workItemID string) (map[string]any, int, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return nil, 0, err
	}
	url := strings.TrimRight(c.cfg.WorkItemsURL, "/") + "/" + workItemID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var decoded map[string]any
	if len(body) > 0 {
		_ = json.Unmarshal(body, &decoded)
	}
	if decoded == nil {
		decoded = map[string]any{"raw": string(body)}
	}
	if resp.StatusCode >= 400 {
		return decoded, resp.StatusCode, fmt.Errorf("aps workitem status=%d body=%s", resp.StatusCode, truncate(string(body), 600))
	}
	return decoded, resp.StatusCode, nil
}

func (c *Client) WaitForWorkItem(ctx context.Context, workItemID string, pollEvery, timeout time.Duration) (map[string]any, error) {
	if pollEvery <= 0 {
		pollEvery = 3 * time.Second
	}
	if timeout <= 0 {
		timeout = 10 * time.Minute
	}
	deadline := time.Now().Add(timeout)
	for {
		status, _, err := c.GetWorkItemStatus(ctx, workItemID)
		if err != nil {
			return status, err
		}
		state, _ := status["status"].(string)
		state = strings.ToLower(strings.TrimSpace(state))
		switch state {
		case "success", "failed", "cancelled", "failedlimitprocessingtime", "faileddownload", "failedinstructions", "failedupload":
			return status, nil
		}
		if time.Now().After(deadline) {
			return status, fmt.Errorf("aps workitem timed out id=%s status=%s", workItemID, state)
		}
		select {
		case <-ctx.Done():
			return status, ctx.Err()
		case <-time.After(pollEvery):
		}
	}
}

func BuildWorkItemRequest(activityID, outputArgName, outputURL string, extra map[string]WorkItemArgument) WorkItemRequest {
	args := make(map[string]WorkItemArgument, len(extra)+1)
	for k, v := range extra {
		args[k] = v
	}
	name := strings.TrimSpace(outputArgName)
	if name == "" {
		name = "outputFile"
	}
	args[name] = WorkItemArgument{
		URL:  outputURL,
		Verb: "put",
	}
	return WorkItemRequest{
		ActivityID: activityID,
		Arguments:  args,
	}
}

func truncate(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
