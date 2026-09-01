package article

import (
	"strings"
	"testing"
)

func TestBlocksInReadingOrderIncludesFooterChrome(t *testing.T) {
	doc := PamphletLite{}
	doc.Header.Title = "Titulo"
	doc.Column1 = []Item{{Type: "paragraph", Content: "Cuerpo"}}
	doc.Footer.Action = "Acción"
	doc.Footer.Message = "Mensaje"
	doc.Footer.Label1 = "WhatsApp"
	doc.Footer.Value1 = "+58"
	blocks := BlocksInReadingOrder(doc)
	plain := PlainText(doc)
	if !strings.Contains(plain, "Titulo") || !strings.Contains(plain, "Cuerpo") {
		t.Fatalf("plain missing body: %q", plain)
	}
	if !strings.Contains(plain, "Acción") || !strings.Contains(plain, "WhatsApp: +58") {
		t.Fatalf("plain missing footer: %q", plain)
	}
	if len(blocks) < 4 {
		t.Fatalf("expected several blocks, got %d", len(blocks))
	}
}

func TestRenderHTMLHasArticleSchema(t *testing.T) {
	html := RenderHTML("Hello", "https://eduardoos.com/dashboard/articulos/ver?id=1", "Hello body", []Block{
		{Type: "heading_1", Content: "Hello"},
		{Type: "paragraph", Content: "Hello body"},
	})
	for _, want := range []string{"application/ld+json", `"@type":"Article"`, "<article>", "Hello body"} {
		if !strings.Contains(html, want) {
			t.Fatalf("html missing %q", want)
		}
	}
}
