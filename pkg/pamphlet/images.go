package pamphlet

import (
	"fmt"
	"net/url"
	"strings"
)

// ContentImagePrefix is the bucket-root prefix for pamphlet content images.
const ContentImagePrefix = "pamphlets/content-images"

// ContentImageObjectKey builds the canonical S3 object key for a content image.
func ContentImageObjectKey(userID, pamphletID, filename string) string {
	userID = strings.TrimSpace(userID)
	pamphletID = strings.TrimSpace(pamphletID)
	if pamphletID == "" {
		pamphletID = DefaultPamphletID
	}
	filename = strings.TrimPrefix(strings.TrimSpace(filename), "/")
	return fmt.Sprintf("%s/%s/%s/%s", ContentImagePrefix, userID, pamphletID, filename)
}

// ContentImageFilenameFromRef derives a stable filename from a content ref like "0:subidea:7".
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

// GatewayImagePath returns the browser-facing gateway path for an absolute S3 key.
func GatewayImagePath(objectKey string) string {
	objectKey = strings.TrimPrefix(strings.TrimSpace(objectKey), "/")
	return "/api/pamphlets/images/" + encodeImagePath(objectKey)
}

func encodeImagePath(objectKey string) string {
	parts := strings.Split(objectKey, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
