package agentsandbox

import "testing"

func TestValidateFileAllowsHtml(t *testing.T) {
	if err := validateFile(File{Name: "index.html", Text: "<html></html>"}); err != nil {
		t.Fatalf("expected html ok, got %v", err)
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

func TestUnescapeFileTextKeepsRealNewlines(t *testing.T) {
	in := "a\nb"
	if unescapeFileText(in) != in {
		t.Fatal("should keep real newlines")
	}
}
