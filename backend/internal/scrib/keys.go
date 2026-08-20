// Package scrib persists layered US Letter drawing sheets under the S3 prefix scrib/.
//
// Layout (bucket eduardoos20260607, env S3_BUCKET):
//
//	scrib/{userSafe}/library.json
//	scrib/{userSafe}/books/{bookId}/book.json
//	scrib/{userSafe}/books/{bookId}/sheets/{sheetId}/sheet.json
//
// userSafe matches the rest of Eduardo OS: email with @ → _at_.
package scrib

import (
	"fmt"
	"strings"
)

// RootPrefix is the top-level S3 key prefix for all Scrib objects.
const RootPrefix = "scrib"

// SafeEmailKey turns an email into a filesystem/S3/URL-safe segment.
func SafeEmailKey(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	email = strings.ReplaceAll(email, "@", "_at_")
	email = strings.ReplaceAll(email, "/", "_")
	return email
}

// UserPrefix is scrib/{userSafe} with no trailing slash.
func UserPrefix(email string) string {
	return fmt.Sprintf("%s/%s", RootPrefix, SafeEmailKey(email))
}

// LibraryKey is scrib/{userSafe}/library.json.
func LibraryKey(email string) string {
	return UserPrefix(email) + "/library.json"
}

// BookKey is scrib/{userSafe}/books/{bookId}/book.json.
func BookKey(email, bookID string) string {
	return fmt.Sprintf("%s/books/%s/book.json", UserPrefix(email), strings.TrimSpace(bookID))
}

// SheetKey is scrib/{userSafe}/books/{bookId}/sheets/{sheetId}/sheet.json.
func SheetKey(email, bookID, sheetID string) string {
	return fmt.Sprintf("%s/books/%s/sheets/%s/sheet.json",
		UserPrefix(email), strings.TrimSpace(bookID), strings.TrimSpace(sheetID))
}

// BookPrefix is scrib/{userSafe}/books/{bookId}/ (trailing slash) for list/delete.
func BookPrefix(email, bookID string) string {
	return fmt.Sprintf("%s/books/%s/", UserPrefix(email), strings.TrimSpace(bookID))
}
