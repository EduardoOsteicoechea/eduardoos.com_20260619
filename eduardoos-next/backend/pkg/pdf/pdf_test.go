package pdf

import (
	"bytes"
	"testing"
)

func TestBuildSamplePDFHasHeaderAndEOF(t *testing.T) {
	data := BuildSamplePDF("Hello Pamphlet")
	if !bytes.HasPrefix(data, []byte("%PDF-1.4")) {
		t.Fatalf("missing PDF header: %q", data[:min(20, len(data))])
	}
	if !bytes.Contains(data, []byte("%%EOF")) {
		t.Fatal("missing PDF EOF marker")
	}
	if !bytes.Contains(data, []byte("Hello Pamphlet")) {
		t.Fatal("title not embedded in content stream")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
