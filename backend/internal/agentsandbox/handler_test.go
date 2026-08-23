package agentsandbox

import "testing"

func TestValidateFileAllowsHtml(t *testing.T) {
	if err := validateFile(File{Name: "index.html", Text: "<html></html>"}); err != nil {
		t.Fatalf("expected html ok, got %v", err)
	}
}

func TestValidateFileAllowsPngBase64(t *testing.T) {
	// Minimal 1x1 PNG.
	const pngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
	if err := validateFile(File{Name: "shot.png", Text: pngB64, Encoding: "base64"}); err != nil {
		t.Fatalf("expected png ok, got %v", err)
	}
	f := normalizeFileForStore(File{Name: "shot.png", Text: pngB64})
	if f.Encoding != "base64" || f.Type != "image/png" {
		t.Fatalf("normalize png: %+v", f)
	}
}

func TestValidateFileRejectsTraversalAndDoubleExt(t *testing.T) {
	if err := validateFile(File{Name: "../x.html", Text: "a"}); err == nil {
		t.Fatal("expected reject traversal")
	}
	if err := validateFile(File{Name: "x.html.exe", Text: "a"}); err == nil {
		t.Fatal("expected reject double ext")
	}
	if err := validateFile(File{Name: "evil.svg", Text: `<svg onload="alert(1)"></svg>`}); err == nil {
		t.Fatal("expected reject unsafe svg")
	}
}

func TestSanitizeAssistantReply(t *testing.T) {
	got := sanitizeAssistantReply(`{"reply":"Hola **mundo**","files":[]}`)
	if got != "Hola **mundo**" {
		t.Fatalf("got %q", got)
	}
	esc := sanitizeAssistantReply(`line1\nline2`)
	if esc != "line1\nline2" {
		t.Fatalf("unescape got %q", esc)
	}
}

func TestProposalFileAliases(t *testing.T) {
	f := proposalFile{Name: "a.css", Content: "body{}"}.toFile()
	if f.Text != "body{}" {
		t.Fatalf("content alias: %q", f.Text)
	}
	f2 := proposalFile{Name: "b.js", Body: "1"}.toFile()
	if f2.Text != "1" {
		t.Fatalf("body alias: %q", f2.Text)
	}
}

func TestHoldArtifactsPrefix(t *testing.T) {
	safe, hold := holdArtifactsPrefix("hello<<<ARTIF")
	if safe != "hello" || hold != "<<<ARTIF" {
		t.Fatalf("partial marker: safe=%q hold=%q", safe, hold)
	}
	safe, hold = holdArtifactsPrefix("plain text")
	if safe != "plain text" || hold != "" {
		t.Fatalf("no hold: safe=%q hold=%q", safe, hold)
	}
}

func TestEstimateAskProgress(t *testing.T) {
	if p := estimateAskProgress("reasoning", 0, 0); p < 5 || p > 10 {
		t.Fatalf("early reasoning: %d", p)
	}
	if p := estimateAskProgress("reasoning", 20000, 0); p < 50 || p > 55 {
		t.Fatalf("late reasoning: %d", p)
	}
	if p := estimateAskProgress("content", 0, 1000); p < 56 || p > 88 {
		t.Fatalf("content: %d", p)
	}
	if estimateAskProgress("done", 0, 0) != 100 {
		t.Fatal("done must be 100")
	}
	if estimateAskProgress("story", 0, 0) != 18 {
		t.Fatal("story phase percent")
	}
}

func TestSplitStoryAndApply(t *testing.T) {
	got := splitStory("<<<STORY>>>\n# App\nHello\n<<<END>>>")
	if got != "# App\nHello" {
		t.Fatalf("split: %q", got)
	}
	site := Site{ID: "s1", Name: "t", Files: nil}
	if err := applyStoryToSite(&site, "# Story body"); err != nil {
		t.Fatal(err)
	}
	if site.Spec != "# Story body" {
		t.Fatalf("spec %q", site.Spec)
	}
	if siteStoryText(site) != "# Story body" {
		t.Fatal("story file missing")
	}
}
