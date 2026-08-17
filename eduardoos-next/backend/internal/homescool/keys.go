// Package homescool implements the Homescool teacher→student registry and
// per-student S3 learning spaces (portfolio, period, skills, study_section, tasks).
//
// Logical persistence table (memory today; DynamoDB-ready shape):
//
//	homescool_student_links
//	  id (PK), teacherEmail, studentEmail, studentSlug, s3Prefix, createdAt
//
// Unique business key: (teacherEmail, studentEmail). Student-facing URL slug is
// the sanitized student email (a_at_b.com), scoped under that teacher.
//
// S3 layout (under S3_PREFIX, default media/):
//
//	homescool/{teacherSafe}/{studentSafe}/{folder}/...
//
// On register we write a zero-byte `.keep` marker into each folder so empty
// prefixes still exist as navigable spaces.
package homescool

import (
	"fmt"
	"strings"
)

// FolderNames are the fixed student-space prefixes every registration creates.
var FolderNames = []string{
	"portfolio",
	"period",
	"skills",
	"study_section",
	"tasks",
}

// IsValidFolder reports whether name is one of the dedicated student folders.
func IsValidFolder(name string) bool {
	name = strings.Trim(strings.ToLower(strings.TrimSpace(name)), "/")
	for _, f := range FolderNames {
		if f == name {
			return true
		}
	}
	return false
}

// SafeEmailKey turns an email into a filesystem/S3/URL-safe segment.
// Matches the rest of Eduardo OS Next (epams, instrumentalist, bim): @ → _at_.
func SafeEmailKey(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	email = strings.ReplaceAll(email, "@", "_at_")
	email = strings.ReplaceAll(email, "/", "_")
	return email
}

// StudentSlug is the public path segment for /homescool/students/{slug}.
func StudentSlug(studentEmail string) string {
	return SafeEmailKey(studentEmail)
}

// RelationshipPrefix is the relative media key for a teacher→student space
// (no trailing slash), e.g. homescool/teacher_at_x.com/student_at_y.com.
func RelationshipPrefix(teacherEmail, studentEmail string) string {
	return fmt.Sprintf(
		"homescool/%s/%s",
		SafeEmailKey(teacherEmail),
		SafeEmailKey(studentEmail),
	)
}

// FolderPrefix returns the relative prefix for one folder under a relationship.
func FolderPrefix(teacherEmail, studentEmail, folder string) string {
	folder = strings.Trim(strings.ToLower(strings.TrimSpace(folder)), "/")
	return RelationshipPrefix(teacherEmail, studentEmail) + "/" + folder
}

// KeepObjectKey is the marker object written so empty folders exist in S3.
func KeepObjectKey(teacherEmail, studentEmail, folder string) string {
	return FolderPrefix(teacherEmail, studentEmail, folder) + "/.keep"
}
