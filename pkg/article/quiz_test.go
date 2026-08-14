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

func TestBlocksPreserveBoldStyleIndexes(t *testing.T) {
	doc := PamphletLite{}
	doc.Header.Title = "Titulo"
	doc.Column1 = []Item{
		{
			Type:         "paragraph",
			Content:      "hola mundo",
			StyleIndexes: [][]int{{5, 10}, {0, 0}, {0, 0}},
		},
	}
	blocks := BlocksInReadingOrder(doc)
	var para *Block
	for i := range blocks {
		if blocks[i].Type == "paragraph" {
			para = &blocks[i]
			break
		}
	}
	if para == nil {
		t.Fatal("expected paragraph block")
	}
	if len(para.StyleIndexes) == 0 || len(para.StyleIndexes[0]) < 2 {
		t.Fatalf("missing style_indexes: %#v", para.StyleIndexes)
	}
	if para.StyleIndexes[0][0] != 5 || para.StyleIndexes[0][1] != 10 {
		t.Fatalf("bold range = %v want [5 10]", para.StyleIndexes[0])
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
