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
