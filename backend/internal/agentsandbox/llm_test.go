package agentsandbox

import (
	"os"
	"testing"
)

func TestIsKimiModel(t *testing.T) {
	if !isKimiModel("kimi-k3") || !isKimiModel("kimi-k2.7-code") {
		t.Fatal("expected kimi prefixes")
	}
	if isKimiModel("deepseek-v4-pro") {
		t.Fatal("deepseek is not kimi")
	}
}

func TestResolveAskModelKimi(t *testing.T) {
	t.Setenv("KIMI_MODEL_EXPERT", "kimi-k3")
	t.Setenv("KIMI_MODEL_CODER", "kimi-k2.7-code")
	t.Setenv("DEEPSEEK_MODEL_REASONING", "deepseek-v4-pro")

	if got := resolveAskModel(askRequest{Model: "kimi-k3"}); got != "kimi-k3" {
		t.Fatalf("got %q", got)
	}
	if got := resolveAskModel(askRequest{Model: "kimi-k2.7-code"}); got != "kimi-k2.7-code" {
		t.Fatalf("got %q", got)
	}
	if got := resolveAskModel(askRequest{Model: "coder"}); got != "kimi-k2.7-code" {
		t.Fatalf("coder alias got %q", got)
	}
	if got := resolveAskModel(askRequest{Model: "deepseek-v4-flash"}); got != "deepseek-v4-flash" {
		t.Fatalf("deepseek got %q", got)
	}
	if got := resolveAskModel(askRequest{Model: ""}); got != "deepseek-v4-pro" {
		t.Fatalf("default got %q want deepseek-v4-pro (DEEPSEEK_MODEL_REASONING=%q)", got, os.Getenv("DEEPSEEK_MODEL_REASONING"))
	}
}
