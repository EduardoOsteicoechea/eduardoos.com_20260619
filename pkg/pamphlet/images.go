package pamphlet

import (
	"fmt"
	"net/url"
	"strings"
)

const MediaPrefix = "media"

const ContentImagePrefix = MediaPrefix + "/pamphlets/content-images"

const LegacyContentImagePrefix = "pamphlets/content-images"

func ContentImageObjectKey(userID, pamphletID, filename string) string {
	userID = strings.TrimSpace(userID)
	pamphletID = strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		pamphletID = DefaultPamphletID
	}
	filename = strings.TrimPrefix(strings.TrimSpace(filename), "/")
	return fmt.Sprintf("%s/%s/%s/%s", ContentImagePrefix, userID, pamphletID, filename)
}

func ContentImageFilenameFromRef(ref, ext string) string {
	ref = strings.TrimSpace(ref)
	if ext == "" {
		ext = ".png"
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	parts := strings.Split(ref, ":")
	if len(parts) == 3 && parts[1] == "subidea" {
		return fmt.Sprintf("%s-subidea-%s%s", parts[0], parts[2], ext)
	}
	safe := strings.NewReplacer(":", "-", "/", "-", "\\", "-", " ", "-").Replace(ref)
	return safe + ext
}

func GatewayImagePath(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	return "/api/pamphlets/images/" + encodeImagePath(objectKey)
}

func NormalizeContentImageObjectKey(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	if strings.HasPrefix(objectKey, ContentImagePrefix+"/") || objectKey == ContentImagePrefix {
		return objectKey
	}
	if strings.HasPrefix(objectKey, LegacyContentImagePrefix+"/") {
		return MediaPrefix + "/" + objectKey
	}
	return objectKey
}

func ResolveContentImageObjectKey(storedValue, userEmail, pamphletID string) string {
	storedValue = strings.TrimSpace(storedValue)
	if storedValue == "" {
		return ""
	}
	if strings.HasPrefix(storedValue, "http://") || strings.HasPrefix(storedValue, "https://") {
		return storedValue
	}
	storedValue = NormalizeContentImageObjectKey(storedValue)
	if strings.HasPrefix(storedValue, ContentImagePrefix+"/") || storedValue == ContentImagePrefix {
		return strings.TrimPrefix(storedValue, "/")
	}
	if strings.HasPrefix(storedValue, "/api/pamphlets/images/") {
		storedValue = strings.TrimPrefix(storedValue, "/api/pamphlets/images/")
	}

	userEmail = strings.TrimSpace(strings.ToLower(userEmail))
	pamphletID = strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		pamphletID = DefaultPamphletID
	}

	filename := strings.TrimPrefix(storedValue, "/")
	filename = strings.TrimPrefix(filename, "images/")
	if strings.Contains(filename, "/") {
		parts := strings.Split(filename, "/")
		filename = parts[len(parts)-1]
	}
	if userEmail != "" && filename != "" {
		return ContentImageObjectKey(userEmail, pamphletID, filename)
	}
	return storedValue
}

func encodeImagePath(objectKey string) string {
	parts := strings.Split(objectKey, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
