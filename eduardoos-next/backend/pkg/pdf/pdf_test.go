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

func TestBuildSamplePDFWinAnsiAccents(t *testing.T) {
	data := BuildSamplePDF("Cómo")
	if bytes.Contains(data, []byte("Ã")) {
		t.Fatal("sample PDF must not embed UTF-8 mojibake")
	}
	if !bytes.Contains(data, []byte{0xF3}) {
		t.Fatal("expected WinAnsi o-acute in sample PDF")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
