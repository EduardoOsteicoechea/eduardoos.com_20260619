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

func TestChatKeyStaysUnderPrefix(t *testing.T) {
	h := &Handler{}
	key := h.chatKey("eduardooost@gmail.com", "abc-123-def")
	if key != "agentsandbox/eduardooost_at_gmail.com/chats/abc-123-def.json" {
		t.Fatalf("unexpected key %s", key)
	}
}
