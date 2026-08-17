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
//
// Hierarchy: group (book) → chapters → verses → words → letter SVGs (32×64).
// Each word stores translation1 / translation2 and ordinals:
//
//	ordinalChapter: 1…1000 within the chapter
//	ordinalBook:    1…10000 within the book/group
//
// DynamoDB catalog (eduardoos_catalog when GREEK_BACKEND/DATABASE_BACKEND=dynamodb):
//
//	SK: greek-group:u:{owner}|g:{groupSlug}
//	data JSON: Group record (title, s3Prefix, counts, timestamps)
package greek

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// RootPrefix is the top-level S3 key prefix for all Greek objects.
const RootPrefix = "greek"

const (
	MaxOrdinalChapter = 1000
	MaxOrdinalBook    = 10000
	LetterWidthPx     = 32
	LetterHeightPx    = 64
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
			b.WriteRune(unicode.ToLower(r))
			prevHyphen = false
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
