package agentsandbox

// LLM provider routing for Agent Sandbox Ask streams.
// DeepSeek keeps thinking/reasoning_effort; Kimi uses OpenAI-compatible chat SSE.

import (
	"bufio"
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

func isKimiModel(model string) bool {
	m := strings.ToLower(strings.TrimSpace(model))
	return strings.HasPrefix(m, "kimi-") || strings.HasPrefix(m, "moonshot-")
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
	case "kimi-k3", "kimi-k2.7-code":
		return m
	case "kimi", "kimi-expert", "expert":
		return httpx.Env("KIMI_MODEL_EXPERT", "kimi-k3")
	case "kimi-referee", "referee":
		return httpx.Env("KIMI_MODEL_REFEREE", "kimi-k3")
	case "kimi-coder", "coder", "code":
		return httpx.Env("KIMI_MODEL_CODER", "kimi-k2.7-code")
	default:
		if isKimiModel(m) {
			return m
		}
		return httpx.Env("DEEPSEEK_MODEL_REASONING", "deepseek-v4-pro")
	}
}

// llmAskStream routes to DeepSeek or Kimi based on the resolved model id.
func llmAskStream(ctx context.Context, model, thinking, effort, system, user string, onDelta func(string), onReasoning func(string), onLog func(stage, msg string)) error {
	if isKimiModel(model) {
		return kimiChatStream(ctx, model, system, user, onDelta, onReasoning, onLog)
	}
	return deepSeekReasoningStream(ctx, model, thinking, effort, system, user, onDelta, onReasoning, onLog)
}

// kimiChatStream posts OpenAI-compatible streaming chat to Moonshot (Kimi).
// Base URL already includes /v1 (e.g. https://api.moonshot.ai/v1).
func kimiChatStream(ctx context.Context, model, system, user string, onDelta func(string), onReasoning func(string), onLog func(stage, msg string)) error {
	if onLog == nil {
		onLog = func(string, string) {}
	}
	if onReasoning == nil {
		onReasoning = func(string) {}
	}
	key := strings.TrimSpace(httpx.Env("KIMI_API_KEY", ""))
	if key == "" {
		return fmt.Errorf("KIMI_API_KEY is not configured")
	}
	if model == "" {
		model = httpx.Env("KIMI_MODEL_EXPERT", "kimi-k3")
	}
	base := strings.TrimRight(httpx.Env("KIMI_BASE_URL", "https://api.moonshot.ai/v1"), "/")
	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"stream": true,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	onLog("kimi.request", fmt.Sprintf("POST %s/chat/completions model=%s bodyBytes=%d", base, model, len(body)))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	res, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return fmt.Errorf("Kimi request failed: %w", err)
	}
	defer res.Body.Close()
	onLog("kimi.response", fmt.Sprintf("HTTP %d — reading SSE body", res.StatusCode))
	if res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		return fmt.Errorf("Kimi status %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	chunks := 0
	reasoningChunks := 0
	reasoningChars := 0
	lastHeartbeat := time.Now()
	for scanner.Scan() {
		line := scanner.Text()
		if time.Since(lastHeartbeat) > 5*time.Second {
			onLog("kimi.heartbeat", fmt.Sprintf("Still reading Kimi SSE… chunks=%d reasoning=%d reasoningChars=%d", chunks, reasoningChunks, reasoningChars))
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
			reasoningChars += len(rc)
			if reasoningChunks == 1 {
				onLog("kimi.reasoning", "Model entered reasoning phase (thinking tokens; not shown in chat).")
			}
			onReasoning(rc)
		}
		delta := chunk.Choices[0].Delta.Content
		if delta != "" {
			chunks++
			onDelta(delta)
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("Kimi SSE read error: %w", err)
	}
	onLog("kimi.done", fmt.Sprintf("SSE complete contentChunks=%d reasoningChunks=%d reasoningChars=%d", chunks, reasoningChunks, reasoningChars))
	return nil
}
