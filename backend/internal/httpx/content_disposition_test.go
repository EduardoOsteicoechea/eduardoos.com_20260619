package httpx

import (
	"strings"
	"testing"
)

func TestContentDispositionAttachmentUTF8(t *testing.T) {
	cd := ContentDispositionAttachment("¿Cómo sabemos que interpretamos correctamente?")
	if !strings.Contains(cd, "filename*=UTF-8''") {
		t.Fatalf("missing filename*: %s", cd)
	}
	if !strings.Contains(cd, "%C2%BF") && !strings.Contains(cd, "%C3%B3") {
		if !strings.Contains(cd, "%C3%") {
			t.Fatalf("expected percent-encoded UTF-8 in filename*: %s", cd)
		}
	}
	if !strings.Contains(cd, `filename="`) {
		t.Fatalf("missing ascii filename fallback: %s", cd)
	}
	quoted := cd[strings.Index(cd, `filename="`)+len(`filename="`):]
	quoted = quoted[:strings.Index(quoted, `"`)]
	for _, r := range quoted {
		if r > 127 {
			t.Fatalf("ascii filename contains non-ASCII %q in %q", r, quoted)
		}
	}
}

func TestContentDispositionKeepsNAndAccentsInStar(t *testing.T) {
	cd := ContentDispositionAttachment("Niño español.pdf")
	if !strings.Contains(cd, "%C3%B1") {
		t.Fatalf("expected encoded ñ: %s", cd)
	}
	if !strings.Contains(cd, ".pdf") {
		t.Fatalf("extension lost: %s", cd)
	}
}
