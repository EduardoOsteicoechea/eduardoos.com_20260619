// Package article flattens pamphlet JSON into linear reading blocks and plain
// text for the public Articles surface (/articulos) and AI crawlers.
package article

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"strings"
)

// PamphletLite is enough of the .epam body to extract article text and blocks.
type PamphletLite struct {
	Type   string `json:"type"`
	ID     string `json:"id"`
	Header struct {
		Title         string `json:"title"`
		Subtitle      string `json:"subtitle"`
		Author        string `json:"author"`
		Series        string `json:"series"`
		SeriesChapter string `json:"series_chapter"`
		Date          string `json:"date"`
	} `json:"header"`
	Footer struct {
		Action     string `json:"action"`
		Message    string `json:"message"`
		Label1     string `json:"label1"`
		Value1     string `json:"value1"`
		Label2     string `json:"label2"`
		Value2     string `json:"value2"`
		Label3     string `json:"label3"`
		Value3     string `json:"value3"`
		Label4     string `json:"label4"`
		Value4     string `json:"value4"`
		Whatsapp   string `json:"whatsapp"`
		Phone      string `json:"phone"`
		Address    string `json:"address"`
		Activities string `json:"activities"`
		Items      []Item `json:"items"`
	} `json:"footer"`
	Column1 []Item `json:"column_1"`
	Column2 []Item `json:"column_2"`
	Column3 []Item `json:"column_3"`
	Column4 []Item `json:"column_4"`
	Column5 []Item `json:"column_5"`
	Column6 []Item `json:"column_6"`
	Column7 []Item `json:"column_7"`
	Column8 []Item `json:"column_8"`
}

// Item is one pamphlet column/footer block.
type Item struct {
	Type         string  `json:"type"`
	Content      string  `json:"content"`
	HeightMm     float64 `json:"height_mm"`
	StyleIndexes [][]int `json:"style_indexes"`
}

// Block is one rendered article segment for the frontend / crawlers.
type Block struct {
	Type         string  `json:"type"` // heading_1 | paragraph | image | meta
	Content      string  `json:"content"`
	StyleIndexes [][]int `json:"style_indexes,omitempty"`
}

// ParsePamphlet decodes pamphlet JSON bytes into PamphletLite.
func ParsePamphlet(raw []byte) (PamphletLite, error) {
	var doc PamphletLite
	if err := json.Unmarshal(raw, &doc); err != nil {
		return PamphletLite{}, err
	}
	return doc, nil
}

// ParsePamphletMap marshals a document map (EpamRecord.Body) then parses it.
func ParsePamphletMap(body map[string]any) (PamphletLite, error) {
	if body == nil {
		return PamphletLite{}, fmt.Errorf("empty pamphlet body")
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return PamphletLite{}, err
	}
	return ParsePamphlet(raw)
}

func appendItems(out []Block, items []Item) []Block {
	for _, it := range items {
		t := strings.TrimSpace(it.Type)
		c := strings.TrimSpace(it.Content)
		if t == "" || c == "" {
			continue
		}
		if t != "paragraph" && t != "heading_1" && t != "image" {
			continue
		}
		out = append(out, Block{Type: t, Content: c, StyleIndexes: it.StyleIndexes})
	}
	return out
}

func labeledLine(label, value string) string {
	label = strings.TrimSpace(label)
	value = strings.TrimSpace(value)
	if label == "" && value == "" {
		return ""
	}
	if label == "" {
		return value
	}
	if value == "" {
		return label
	}
	return label + ": " + value
}

// BlocksInReadingOrder returns header title + body columns 1–8 + footer text.
func BlocksInReadingOrder(doc PamphletLite) []Block {
	var out []Block
	if t := strings.TrimSpace(doc.Header.Title); t != "" {
		out = append(out, Block{Type: "heading_1", Content: t})
	}
	metaBits := []string{}
	for _, s := range []string{doc.Header.Subtitle, doc.Header.Author, doc.Header.Series, doc.Header.SeriesChapter, doc.Header.Date} {
		if strings.TrimSpace(s) != "" {
			metaBits = append(metaBits, strings.TrimSpace(s))
		}
	}
	if len(metaBits) > 0 {
		out = append(out, Block{Type: "meta", Content: strings.Join(metaBits, " · ")})
	}
	for _, col := range [][]Item{
		doc.Column1, doc.Column2, doc.Column3, doc.Column4,
		doc.Column5, doc.Column6, doc.Column7, doc.Column8,
	} {
		out = appendItems(out, col)
	}

	// Structured footer chrome (action / message / 2×2 meta), then legacy items.
	if a := strings.TrimSpace(doc.Footer.Action); a != "" {
		out = append(out, Block{Type: "heading_1", Content: a})
	}
	if m := strings.TrimSpace(doc.Footer.Message); m != "" {
		out = append(out, Block{Type: "paragraph", Content: m})
	}
	footerMeta := []string{
		labeledLine(firstNonEmpty(doc.Footer.Label1, "WhatsApp"), firstNonEmpty(doc.Footer.Value1, doc.Footer.Whatsapp)),
		labeledLine(firstNonEmpty(doc.Footer.Label2, "Teléfono"), firstNonEmpty(doc.Footer.Value2, doc.Footer.Phone)),
		labeledLine(firstNonEmpty(doc.Footer.Label3, "Dirección"), firstNonEmpty(doc.Footer.Value3, doc.Footer.Address)),
		labeledLine(firstNonEmpty(doc.Footer.Label4, "Actividades"), firstNonEmpty(doc.Footer.Value4, doc.Footer.Activities)),
	}
	for _, line := range footerMeta {
		if line != "" {
			out = append(out, Block{Type: "meta", Content: line})
		}
	}
	out = appendItems(out, doc.Footer.Items)
	return out
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

// PlainText extracts non-image text for hashing and AI crawlers.
func PlainText(doc PamphletLite) string {
	var b strings.Builder
	for _, block := range BlocksInReadingOrder(doc) {
		if block.Type == "image" {
			continue
		}
		b.WriteString(block.Content)
		b.WriteString("\n\n")
	}
	return strings.TrimSpace(b.String())
}

// ContentHash fingerprints article plain text.
func ContentHash(text string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(text)))
	return hex.EncodeToString(sum[:])
}

// RenderHTML builds a minimal semantic HTML document for AI / search crawlers.
func RenderHTML(title, canonicalURL, plain string, blocks []Block) string {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Article"
	}
	var body strings.Builder
	body.WriteString("<main>\n<article>\n")
	body.WriteString("<header><h1>")
	body.WriteString(html.EscapeString(title))
	body.WriteString("</h1></header>\n")
	for _, block := range blocks {
		c := html.EscapeString(block.Content)
		switch block.Type {
		case "heading_1":
			body.WriteString("<h2>")
			body.WriteString(c)
			body.WriteString("</h2>\n")
		case "meta":
			body.WriteString("<p><em>")
			body.WriteString(c)
			body.WriteString("</em></p>\n")
		case "image":
			body.WriteString("<figure><img src=\"")
			body.WriteString(html.EscapeString(block.Content))
			body.WriteString("\" alt=\"\"></figure>\n")
		default:
			body.WriteString("<p>")
			body.WriteString(c)
			body.WriteString("</p>\n")
		}
	}
	body.WriteString("</article>\n</main>\n")

	var out strings.Builder
	out.WriteString("<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n<meta charset=\"utf-8\">\n")
	out.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n")
	out.WriteString("<meta name=\"robots\" content=\"index,follow,max-snippet:-1,max-image-preview:large\">\n")
	out.WriteString("<title>")
	out.WriteString(html.EscapeString(title))
	out.WriteString(" — Eduardo OS Articles</title>\n")
	if strings.TrimSpace(canonicalURL) != "" {
		out.WriteString("<link rel=\"canonical\" href=\"")
		out.WriteString(html.EscapeString(canonicalURL))
		out.WriteString("\">\n")
	}
	out.WriteString("<meta name=\"description\" content=\"")
	desc := plain
	if len([]rune(desc)) > 280 {
		desc = string([]rune(desc)[:277]) + "…"
	}
	out.WriteString(html.EscapeString(desc))
	out.WriteString("\">\n")
	out.WriteString("<script type=\"application/ld+json\">")
	ld := map[string]any{
		"@context": "https://schema.org",
		"@type":    "Article",
		"headline": title,
		"inLanguage": "es",
		"isAccessibleForFree": true,
		"articleBody": plain,
	}
	if strings.TrimSpace(canonicalURL) != "" {
		ld["url"] = canonicalURL
		ld["mainEntityOfPage"] = canonicalURL
	}
	if raw, err := json.Marshal(ld); err == nil {
		out.Write(raw)
	}
	out.WriteString("</script>\n</head>\n<body>\n")
	out.WriteString(body.String())
	out.WriteString("</body>\n</html>\n")
	return out.String()
}
