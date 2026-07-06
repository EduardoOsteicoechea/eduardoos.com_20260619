package profile

import (
	"fmt"
	"path/filepath"
	"strings"

	"eduardoos/pkg/s3store"
)

// MediaPrefix is the site-wide S3 object prefix (see S3_PREFIX, default "media").
const MediaPrefix = "media"

// ProfilesPrefix is where user avatars are stored inside the media prefix.
const ProfilesPrefix = "profiles"

// ImageObjectKey builds the canonical S3 object key for a profile avatar.
func ImageObjectKey(userEmail, filename string) string {
	userEmail = strings.TrimSpace(strings.ToLower(userEmail))
	filename = strings.TrimPrefix(strings.TrimSpace(filename), "/")
	if filename == "" {
		filename = "avatar.png"
	}
	return fmt.Sprintf("%s/%s/%s/%s", MediaPrefix, ProfilesPrefix, userEmail, filename)
}

// ImageFilenameFromUpload picks a stable avatar filename from an uploaded file name.
func ImageFilenameFromUpload(originalName string) string {
	ext := filepath.Ext(originalName)
	if ext == "" {
		ext = ".png"
	}
	return "avatar" + ext
}

// GatewayMediaFilePath returns the browser-facing gateway path for a stored object key.
func GatewayMediaFilePath(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	rel := s3store.RelativeKey(MediaPrefix, objectKey)
	if rel == objectKey && strings.HasPrefix(objectKey, ProfilesPrefix+"/") {
		rel = objectKey
	}
	return "/api/media/file/" + s3store.EncodeRelativePath(rel)
}

// NormalizeImageObjectKey upgrades legacy bucket-root keys to the media/ prefix.
func NormalizeImageObjectKey(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	if strings.HasPrefix(objectKey, MediaPrefix+"/") {
		return objectKey
	}
	if strings.HasPrefix(objectKey, ProfilesPrefix+"/") {
		return MediaPrefix + "/" + objectKey
	}
	return objectKey
}
