package profile

import (
	"fmt"
	"path/filepath"
	"strings"

	"eduardoos/pkg/s3store"
)

const MediaPrefix = "media"

const ProfilesPrefix = "profiles"

func ImageObjectKey(userEmail, filename string) string {
	userEmail = strings.TrimSpace(strings.ToLower(userEmail))
	filename = strings.TrimPrefix(strings.TrimSpace(filename), "/")
	if filename == "" {
		filename = "avatar.png"
	}
	return fmt.Sprintf("%s/%s/%s/%s", MediaPrefix, ProfilesPrefix, userEmail, filename)
}

func ImageFilenameFromUpload(originalName string) string {
	ext := filepath.Ext(originalName)
	if ext == "" {
		ext = ".png"
	}
	return "avatar" + ext
}

func GatewayMediaFilePath(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	rel := s3store.RelativeKey(MediaPrefix, objectKey)
	if rel == objectKey && strings.HasPrefix(objectKey, ProfilesPrefix+"/") {
		rel = objectKey
	}
	return "/api/media/file/" + s3store.EncodeRelativePath(rel)
}

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
