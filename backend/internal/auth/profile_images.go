package auth

import (
	"fmt"
	"net/url"
	"path/filepath"
	"strings"
)

// Profile image S3 layout matches production:
//   media/profiles/{email}/avatar.{ext}
// Public URL (gateway parity):
//   /api/media/file/profiles/{email}/avatar.{ext}

const mediaPrefix = "media"
const profilesPrefix = "profiles"

// ProfileImageObjectKey builds the absolute S3 object key for a user avatar.
func ProfileImageObjectKey(userEmail, filename string) string {
	userEmail = NormalizeEmail(userEmail)
	filename = strings.TrimPrefix(strings.TrimSpace(filename), "/")
	if filename == "" {
		filename = "avatar.png"
	}
	return fmt.Sprintf("%s/%s/%s/%s", mediaPrefix, profilesPrefix, userEmail, filename)
}

// ProfileImageFilenameFromUpload normalizes an upload name to avatar{ext}.
func ProfileImageFilenameFromUpload(originalName string) string {
	ext := filepath.Ext(originalName)
	if ext == "" {
		ext = ".png"
	}
	return "avatar" + strings.ToLower(ext)
}

// NormalizeProfileImageObjectKey ensures the key includes the media/ prefix.
func NormalizeProfileImageObjectKey(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	if objectKey == "" {
		return ""
	}
	if strings.HasPrefix(objectKey, mediaPrefix+"/") {
		return objectKey
	}
	if strings.HasPrefix(objectKey, profilesPrefix+"/") {
		return mediaPrefix + "/" + objectKey
	}
	return objectKey
}

// ProfileImageURLFromKey returns the public gateway path for a stored object key.
// Empty key → empty URL (caller falls back to the letter initial).
func ProfileImageURLFromKey(objectKey string) string {
	key := NormalizeProfileImageObjectKey(objectKey)
	if key == "" {
		return ""
	}
	rel := strings.TrimPrefix(key, mediaPrefix+"/")
	return "/api/media/file/" + encodeProfileMediaPath(rel)
}

func encodeProfileMediaPath(key string) string {
	parts := strings.Split(key, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
