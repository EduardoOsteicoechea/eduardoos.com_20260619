package article

import "testing"

func TestContentHashStable(t *testing.T) {
	a := ContentHash("hola mundo")
	b := ContentHash("hola mundo")
	c := ContentHash("hola mundo!")
	if a != b {
		t.Fatalf("hash not stable")
	}
	if a == c {
		t.Fatalf("different text should differ")
	}
}

func TestPlainTextSkipsImages(t *testing.T) {
	doc := PamphletLite{}
	doc.Header.Title = "Titulo"
	doc.Column1 = []Item{
		{Type: "paragraph", Content: "Uno"},
		{Type: "image", Content: "data:image/jpeg;base64,xxx"},
		{Type: "heading_1", Content: "Dos"},
	}
	text := PlainText(doc)
	if !contains(text, "Titulo") || !contains(text, "Uno") || !contains(text, "Dos") {
		t.Fatalf("missing text: %q", text)
	}
	if contains(text, "data:image") {
		t.Fatalf("should skip images: %q", text)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
