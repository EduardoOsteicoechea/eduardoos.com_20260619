package pdf

import (
	"strings"
	"testing"
)

func TestMmToPoints(t *testing.T) {
	pts := MmToPoints(25.4)
	if pts < 71.9 || pts > 72.1 {
		t.Fatalf("expected ~72, got %v", pts)
	}
}

func TestPDFHeaderAndEOF(t *testing.T) {
	data := BuildSamplePDF("Test")
	text := string(data)
	if !strings.HasPrefix(text, "%PDF-1.4") {
		t.Fatal("missing header")
	}
	if !strings.Contains(text, "%%EOF") {
		t.Fatal("missing eof")
	}
}
