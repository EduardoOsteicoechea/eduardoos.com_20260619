// Package evoice stores text-to-audio projects under S3 prefix evoice/ (spec 044).
//
//	evoice/{userSafe}/.keep
//	evoice/{userSafe}/{project}/docs/<sources>
//	evoice/{userSafe}/{project}/audios/<stem>.mp3
package evoice

import (
	"fmt"
	"path"
	"regexp"
	"strings"
)

// RootPrefix is the top-level S3 key prefix for all eVoice objects.
const RootPrefix = "evoice"

// ProjectMarkerName is ignored when listing projects (handout parity).
const ProjectMarkerName = "CREATE_A_FOLDER_BY_GENERATION_PROJECT_BESIDE_THIS_ONE"

// SafeEmailKey turns an email into a filesystem/S3/URL-safe segment.
func SafeEmailKey(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	email = strings.ReplaceAll(email, "@", "_at_")
	email = strings.ReplaceAll(email, "/", "_")
	return email
}

// UserPrefix is evoice/{userSafe} with no trailing slash.
func UserPrefix(emailOrSafe string) string {
	s := strings.TrimSpace(emailOrSafe)
	if strings.Contains(s, "@") {
		s = SafeEmailKey(s)
	}
	return fmt.Sprintf("%s/%s", RootPrefix, s)
}

// UserKeepKey marks that a registered user's folder exists.
func UserKeepKey(emailOrSafe string) string {
	return UserPrefix(emailOrSafe) + "/.keep"
}

// ProjectPrefix is evoice/{userSafe}/{project} with no trailing slash.
func ProjectPrefix(emailOrSafe, project string) string {
	return fmt.Sprintf("%s/%s", UserPrefix(emailOrSafe), sanitizeProject(project))
}

func DocsPrefix(emailOrSafe, project string) string {
	return ProjectPrefix(emailOrSafe, project) + "/docs"
}

func AudiosPrefix(emailOrSafe, project string) string {
	return ProjectPrefix(emailOrSafe, project) + "/audios"
}

func DocsKeepKey(emailOrSafe, project string) string {
	return DocsPrefix(emailOrSafe, project) + "/.keep"
}

func AudiosKeepKey(emailOrSafe, project string) string {
	return AudiosPrefix(emailOrSafe, project) + "/.keep"
}

// DocKey is evoice/{userSafe}/{project}/docs/{fileName}.
func DocKey(emailOrSafe, project, fileName string) string {
	return DocsPrefix(emailOrSafe, project) + "/" + sanitizeFileName(fileName)
}

// AudioKey is evoice/{userSafe}/{project}/audios/{stem}.mp3.
func AudioKey(emailOrSafe, project, fileName string) string {
	return AudiosPrefix(emailOrSafe, project) + "/" + sanitizeFileName(fileName)
}

var projectNameRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)

func sanitizeProject(name string) string {
	name = strings.TrimSpace(name)
	name = strings.ReplaceAll(name, "/", "-")
	name = strings.ReplaceAll(name, "\\", "-")
	return name
}

func sanitizeFileName(name string) string {
	name = path.Base(strings.TrimSpace(name))
	name = strings.ReplaceAll(name, "..", "")
	return name
}

// ValidProjectName reports whether a project name is safe for S3 keys/URLs.
func ValidProjectName(name string) bool {
	name = sanitizeProject(name)
	if name == "" || name == ProjectMarkerName || name == "." || name == ".." {
		return false
	}
	return projectNameRe.MatchString(name)
}

// JobSnapshotKey is evoice/_jobs/{jobId}.json (durable across process restarts).
// Global under evoice/_jobs/ so GET /jobs/{id} can load after restart without knowing the owner.
func JobSnapshotKey(jobID string) string {
	return fmt.Sprintf("%s/_jobs/%s.json", RootPrefix, strings.TrimSpace(jobID))
}

// ValidFileName reports whether a docs/audios basename is safe for S3 keys/URLs.
func ValidFileName(name string) bool {
	name = sanitizeFileName(name)
	if name == "" || name == "." || name == ".." || name == ".keep" {
		return false
	}
	if strings.Contains(name, "/") || strings.Contains(name, "\\") {
		return false
	}
	if len(name) > 200 {
		return false
	}
	return true
}
