package agentsandbox

import (
	"strings"
	"testing"
)

// TestAskSystemPromptsEnforceSPAViewRouting locks the 026 non-negotiable:
// sandbox "routes" must be SPA views, never host/Astro paths.
func TestAskSystemPromptsEnforceSPAViewRouting(t *testing.T) {
	needles := []string{
		"NON-NEGOTIABLE (generated-site routing)",
		"SPA view",
		"host/Astro/nginx",
		"views (ids/labels)",
	}
	for _, prompt := range []string{storyPhaseSystemPrompt(), codegenPhaseSystemPrompt()} {
		for _, n := range needles {
			if !strings.Contains(prompt, n) {
				t.Fatalf("prompt missing %q\n---\n%s", n, prompt)
			}
		}
		if strings.Contains(prompt, "create a real /about route on the host") {
			t.Fatal("prompt must not encourage host routes")
		}
	}
	if !strings.Contains(codegenPhaseSystemPrompt(), "single-shell multi-view SPA") {
		t.Fatal("codegen prompt should prefer single-shell multi-view SPA")
	}
}
