// Package greek implements the Greek letter-by-letter book builder.
//
// Admin-only product: JWT + platform admin (role admin or bootstrap email).
// Purpose: copy/visualize entire books letter-by-letter across languages.
//
// S3 layout (bucket-root prefix, sibling of homeschool/, ifcbim/, media/):
//
//	greek/{userSafe}/{groupSlug}/group.json
//	greek/{userSafe}/{groupSlug}/chapters/{ch}/chapter.json
//	greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/verse.json
//	greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/words/{w}/word.json
//	greek/{userSafe}/{groupSlug}/chapters/{ch}/verses/{v}/words/{w}/letters/{i}.svg
//	greek/{userSafe}/gallery/index.json          ← letter catalog index
//	greek/{userSafe}/gallery/{glyphSlug}.svg     ← catalog glyph (draw/override)
//
// Hierarchy: group (book) → chapters → verses → words → letter-images (32×64 SVG).
// Each word stores translation1 / translation2, ordinals, and letterImages metadata
// (slug + alphabetNumber). Letter SVGs are ordered by alphabetNumber ascending.
//
// Alphabet numbers are fixed to the clean Greek alphabet catalog (1=Alpha … 24=Omega):
//   n = uppercase plain, n.1 = lowercase plain, 18.2 = sigma final (ς).
// Validation still allows 1…30 with 0.1 steps for legacy rows.
//
// The letter catalog (UI) is stored under greek/{userSafe}/gallery/ (same prefix;
// not a separate catalog/ tree). Admins seed slots, draw/override SVGs there, then
// pick catalog glyphs into words (no free-draw on the word card).
//
// DynamoDB catalog (eduardoos_catalog when GREEK_BACKEND/DATABASE_BACKEND=dynamodb):
//
//	SK: greek-group:u:{owner}|g:{groupSlug}
//	data JSON: Group record (title, s3Prefix, counts, timestamps)
package greek

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"unicode"
)

// RootPrefix is the top-level S3 key prefix for all Greek objects.
const RootPrefix = "greek"

const (
	MaxOrdinalChapter   = 1000
	MaxOrdinalBook      = 10000
	LetterWidthPx       = 32
	LetterHeightPx      = 64
	MinAlphabetNumber   = 1.0
	MaxAlphabetNumber   = 30.0
	AlphabetNumberStep  = 0.1
)

var safeSlugRe = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

// SafeEmailKey turns an email into a filesystem/S3-safe segment (@ → _at_).
func SafeEmailKey(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	email = strings.ReplaceAll(email, "@", "_at_")
	email = strings.ReplaceAll(email, "/", "_")
	return email
}

// SanitizeSlug normalizes a user-facing name into a URL/S3 segment.
// Empty or invalid input returns "".
func SanitizeSlug(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}
	var b strings.Builder
	prevHyphen := false
	for _, r := range raw {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			// Only keep ASCII [a-z0-9] so the result always matches safeSlugRe.
			lower := unicode.ToLower(r)
			if (lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9') {
				b.WriteRune(lower)
				prevHyphen = false
			}
		case r == ' ' || r == '_' || r == '-' || r == '.' || r == '/':
			if b.Len() > 0 && !prevHyphen {
				b.WriteByte('-')
				prevHyphen = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" || !safeSlugRe.MatchString(out) {
		return ""
	}
	if len(out) > 80 {
		out = out[:80]
		out = strings.Trim(out, "-")
	}
	return out
}

// IsValidSlug reports whether s is a safe path segment.
func IsValidSlug(s string) bool {
	s = strings.TrimSpace(s)
	return s != "" && safeSlugRe.MatchString(s) && len(s) <= 80
}

// UserPrefix is greek/{userSafe} (no trailing slash).
func UserPrefix(ownerEmail string) string {
	return fmt.Sprintf("%s/%s", RootPrefix, SafeEmailKey(ownerEmail))
}

// GroupPrefix is greek/{userSafe}/{groupSlug}.
func GroupPrefix(ownerEmail, groupSlug string) string {
	return fmt.Sprintf("%s/%s", UserPrefix(ownerEmail), strings.Trim(groupSlug, "/"))
}

// GroupMetaKey is the group.json object key.
func GroupMetaKey(ownerEmail, groupSlug string) string {
	return GroupPrefix(ownerEmail, groupSlug) + "/group.json"
}

// ChapterPrefix / ChapterMetaKey for a chapter under a group.
func ChapterPrefix(ownerEmail, groupSlug, chapterSlug string) string {
	return GroupPrefix(ownerEmail, groupSlug) + "/chapters/" + strings.Trim(chapterSlug, "/")
}

func ChapterMetaKey(ownerEmail, groupSlug, chapterSlug string) string {
	return ChapterPrefix(ownerEmail, groupSlug, chapterSlug) + "/chapter.json"
}

// VersePrefix / VerseMetaKey for a verse under a chapter.
func VersePrefix(ownerEmail, groupSlug, chapterSlug, verseSlug string) string {
	return ChapterPrefix(ownerEmail, groupSlug, chapterSlug) + "/verses/" + strings.Trim(verseSlug, "/")
}

func VerseMetaKey(ownerEmail, groupSlug, chapterSlug, verseSlug string) string {
	return VersePrefix(ownerEmail, groupSlug, chapterSlug, verseSlug) + "/verse.json"
}

// WordPrefix / WordMetaKey for a word under a verse.
func WordPrefix(ownerEmail, groupSlug, chapterSlug, verseSlug, wordSlug string) string {
	return VersePrefix(ownerEmail, groupSlug, chapterSlug, verseSlug) + "/words/" + strings.Trim(wordSlug, "/")
}

func WordMetaKey(ownerEmail, groupSlug, chapterSlug, verseSlug, wordSlug string) string {
	return WordPrefix(ownerEmail, groupSlug, chapterSlug, verseSlug, wordSlug) + "/word.json"
}

// LetterKey is letters/{index}.svg under a word (1-based index preferred).
func LetterKey(ownerEmail, groupSlug, chapterSlug, verseSlug, wordSlug string, index int) string {
	return fmt.Sprintf("%s/letters/%d.svg", WordPrefix(ownerEmail, groupSlug, chapterSlug, verseSlug, wordSlug), index)
}

// GalleryPrefix is greek/{userSafe}/gallery (reusable letter-image glyphs).
func GalleryPrefix(ownerEmail string) string {
	return UserPrefix(ownerEmail) + "/gallery"
}

// GalleryIndexKey is gallery/index.json for the owner's glyph catalog.
func GalleryIndexKey(ownerEmail string) string {
	return GalleryPrefix(ownerEmail) + "/index.json"
}

// GalleryGlyphKey is gallery/{glyphSlug}.svg.
func GalleryGlyphKey(ownerEmail, glyphSlug string) string {
	return GalleryPrefix(ownerEmail) + "/" + strings.Trim(glyphSlug, "/") + ".svg"
}

// ValidateOrdinals checks chapter (1–1000) and book (1–10000) ordinals.
func ValidateOrdinals(ordinalChapter, ordinalBook int) error {
	if ordinalChapter < 1 || ordinalChapter > MaxOrdinalChapter {
		return fmt.Errorf("ordinalChapter must be 1–%d", MaxOrdinalChapter)
	}
	if ordinalBook < 1 || ordinalBook > MaxOrdinalBook {
		return fmt.Errorf("ordinalBook must be 1–%d", MaxOrdinalBook)
	}
	return nil
}

// ValidateAlphabetNumber checks letter ordering numbers in [1, 30] with 0.1 steps.
// Values like 1.1 and 1.2 are allowed so letters can sit between integers.
func ValidateAlphabetNumber(n float64) error {
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return fmt.Errorf("alphabetNumber must be a finite number")
	}
	if n < MinAlphabetNumber || n > MaxAlphabetNumber {
		return fmt.Errorf("alphabetNumber must be %.0f–%.0f", MinAlphabetNumber, MaxAlphabetNumber)
	}
	// Allow one-decimal steps (1.0, 1.1, …) with float tolerance.
	scaled := n * 10
	nearest := math.Round(scaled)
	if math.Abs(scaled-nearest) > 1e-6 {
		return fmt.Errorf("alphabetNumber must use steps of %.1f (e.g. 1.1, 1.2)", AlphabetNumberStep)
	}
	return nil
}

// NormalizeAlphabetNumber snaps a valid alphabet number onto the 0.1 grid.
func NormalizeAlphabetNumber(n float64) float64 {
	return math.Round(n*10) / 10
}
