package profile

import (
	"fmt"
	"path/filepath"
	"strings"

	"eduardoos/pkg/s3store"
)

// ImagePrefix is the bucket-root prefix for user profile avatars.
const ImagePrefix = "profiles"

// ImageObjectKey builds the canonical S3 object key for a profile avatar.
func ImageObjectKey(userEmail, filename string) string {
	userEmail = strings.TrimSpace(strings.ToLower(userEmail))
	filename = strings.TrimPrefix(strings.TrimSpace(filename), "/")
	if filename == "" {
		filename = "avatar.png"
	}
	return fmt.Sprintf("%s/%s/%s", ImagePrefix, userEmail, filename)
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
	return "/api/media/file/" + s3store.EncodeRelativePath(strings.TrimPrefix(strings.TrimSpace(objectKey), "/"))
}
