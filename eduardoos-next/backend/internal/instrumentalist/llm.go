package instrumentalist

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"eduardoos.nex/internal/httpx"
)

// NewDeepSeekLLM returns an LLMFunc backed by DeepSeek chat completions.
// When DEEPSEEK_API_KEY is empty, the function returns a clear configuration error
// so handlers can respond 503 (UI opens ServerErrorModal).
func NewDeepSeekLLM() LLMFunc {
	apiKey := strings.TrimSpace(httpx.Env("DEEPSEEK_API_KEY", ""))
	baseURL := strings.TrimRight(httpx.Env("DEEPSEEK_BASE_URL", "https://api.deepseek.com"), "/")
	model := httpx.Env("DEEPSEEK_MODEL_EXPERT", "deepseek-v4-flash")
	return func(ctx context.Context, mode, system, user string) (string, error) {
		if apiKey == "" {
			return "", fmt.Errorf("DEEPSEEK_API_KEY is not configured")
		}
		_ = mode
		payload := map[string]any{
			"model": model,
			"messages": []map[string]string{
				{"role": "system", "content": system},
				{"role": "user", "content": user},
			},
			"stream": false,
			"thinking": map[string]string{"type": "disabled"},
		}
		body, err := json.Marshal(payload)
		if err != nil {
			return "", err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+apiKey)
		client := &http.Client{Timeout: 50 * time.Second}
		res, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer res.Body.Close()
		raw, _ := io.ReadAll(res.Body)
		if res.StatusCode >= 300 {
			msg := string(raw)
			if len(msg) > 400 {
				msg = msg[:400]
			}
			return "", fmt.Errorf("deepseek status %d: %s", res.StatusCode, msg)
		}
		var parsed struct {
			Choices []struct {
				Message struct {
					Content string `json:"content"`
				} `json:"message"`
			} `json:"choices"`
		}
		if err := json.Unmarshal(raw, &parsed); err != nil {
			return "", err
		}
		if len(parsed.Choices) == 0 {
			return "", fmt.Errorf("deepseek returned no choices")
		}
		return parsed.Choices[0].Message.Content, nil
	}
}
