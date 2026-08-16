package httpx

import (
	"net/url"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ContentDispositionAttachment builds a RFC 6266 / 5987 Content-Disposition value
// that preserves accents and ñ in modern browsers via filename*=UTF-8''...
// while keeping an ASCII-only filename= fallback for older clients.
func ContentDispositionAttachment(rawName string) string {
	base := sanitizeDownloadBase(rawName)
	if base == "" {
		base = "download"
	}
	ascii := asciiFilenameFallback(base)
	encoded := url.PathEscape(base)
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	return `attachment; filename="` + ascii + `"; filename*=UTF-8''` + encoded
}

func sanitizeDownloadBase(name string) string {
	name = strings.TrimSpace(name)
	name = path.Base(name)
	var b strings.Builder
	for _, r := range name {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\n', '\r', '\t':
			b.WriteByte('_')
		default:
			if unicode.IsControl(r) {
				continue
			}
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	out = strings.Trim(out, " .")
	if out == "" {
		return ""
	}
	const maxRunes = 80
	if utf8.RuneCountInString(out) > maxRunes {
		runes := []rune(out)
		out = string(runes[:maxRunes])
		out = strings.TrimRight(out, " .")
	}
	return out
}

func asciiFilenameFallback(name string) string {
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '.', r == '-', r == '_':
			b.WriteRune(r)
		case r == ' ':
			b.WriteByte('_')
		default:
			if rep, ok := spanishASCII[r]; ok {
				b.WriteString(rep)
			} else {
				b.WriteByte('_')
			}
		}
	}
	out := strings.Trim(b.String(), "._")
	if out == "" {
		return "download"
	}
	return out
}

var spanishASCII = map[rune]string{
	'á': "a", 'à': "a", 'ä': "a", 'â': "a", 'ã': "a",
	'é': "e", 'è': "e", 'ë': "e", 'ê': "e",
	'í': "i", 'ì': "i", 'ï': "i", 'î': "i",
	'ó': "o", 'ò': "o", 'ö': "o", 'ô': "o", 'õ': "o",
	'ú': "u", 'ù': "u", 'ü': "u", 'û': "u",
	'ñ': "n", 'Ñ': "N",
	'Á': "A", 'É': "E", 'Í': "I", 'Ó': "O", 'Ú': "U",
	'¿': "", '¡': "",
}
