package scrib

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPrintPDFDownloadsLetter(t *testing.T) {
	_, r := testRouter(t)
	token := bearer(t, "printer@example.com")

	img := image.NewGray(image.Rect(0, 0, 32, 40))
	for y := 0; y < 40; y++ {
		for x := 0; x < 32; x++ {
			img.SetGray(x, y, color.Gray{Y: 200})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	payload := `{"imageBase64":"data:image/jpeg;base64,` + base64.StdEncoding.EncodeToString(buf.Bytes()) + `","fileName":"test-sheet"}`

	req := httptest.NewRequest(http.MethodPost, "/api/scrib/print/pdf", strings.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/pdf" {
		t.Fatalf("Content-Type=%q", ct)
	}
	if !strings.Contains(rec.Header().Get("Content-Disposition"), "attachment") {
		t.Fatalf("disposition=%q", rec.Header().Get("Content-Disposition"))
	}
	if !bytes.HasPrefix(rec.Body.Bytes(), []byte("%PDF-1.4")) {
		t.Fatalf("not pdf")
	}
}

func TestPrintPDFRequiresAuth(t *testing.T) {
	_, r := testRouter(t)
	req := httptest.NewRequest(http.MethodPost, "/api/scrib/print/pdf", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code == http.StatusOK {
		t.Fatalf("expected auth failure, got %d", rec.Code)
	}
}
