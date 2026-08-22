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

func TestSplitArtifacts(t *testing.T) {
	md, art := splitArtifacts("Hola **mundo**\n\n<<<ARTIFACTS>>>\n{\"spec\":\"x\"}\n<<<END>>>")
	if md != "Hola **mundo**" {
		t.Fatalf("markdown=%q", md)
	}
	if art != `{"spec":"x"}` {
		t.Fatalf("artifacts=%q", art)
	}
}
