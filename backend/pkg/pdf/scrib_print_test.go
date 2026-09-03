package pdf

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"
)

func TestBuildScribPrintPDF(t *testing.T) {
	img := image.NewGray(image.Rect(0, 0, 40, 50))
	for y := 0; y < 50; y++ {
		for x := 0; x < 40; x++ {
			img.SetGray(x, y, color.Gray{Y: uint8((x + y) % 256)})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	pdfBytes, err := BuildScribPrintPDF(buf.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	s := string(pdfBytes)
	if !strings.HasPrefix(s, "%PDF-1.4") || !strings.Contains(s, "%%EOF") {
		t.Fatalf("bad pdf header/eof")
	}
	if !strings.Contains(s, "/Subtype /Image") || !strings.Contains(s, "/DCTDecode") {
		t.Fatal("expected JPEG XObject")
	}
	// Portrait letter MediaBox ~ 612 x 792 pt
	wantW := MmToPoints(ScribPageWidthMm)
	wantH := MmToPoints(ScribPageHeightMm)
	needle := strings.Contains(s, "MediaBox")
	if !needle {
		t.Fatal("missing MediaBox")
	}
	if wantW < 610 || wantW > 614 || wantH < 790 || wantH > 794 {
		t.Fatalf("unexpected letter pts w=%.2f h=%.2f", wantW, wantH)
	}
}

func TestBuildScribPrintPDFRejectsGarbage(t *testing.T) {
	_, err := BuildScribPrintPDF([]byte("not-an-image"))
	if err == nil {
		t.Fatal("expected error")
	}
}
