package s3store

import (
	"fmt"
	"net/url"
	"path"
	"strings"
	"time"
)

// ImageItem is a gallery-ready object with display metadata.
type ImageItem struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	ContentType  string `json:"content_type"`
	Size         int    `json:"size"`
	SizeHuman    string `json:"size_human"`
	LastModified string `json:"last_modified"`
}

// IsImageContentType reports whether ct is an image MIME type.
func IsImageContentType(ct string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(ct)), "image/")
}

// BaseName returns the filename portion of an object key.
func BaseName(objectKey string) string {
	return path.Base(strings.TrimPrefix(objectKey, "/"))
}

// ContentTypeFromKey guesses MIME type from file extension.
func ContentTypeFromKey(objectKey string) string {
	switch strings.ToLower(path.Ext(objectKey)) {
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".ico":
		return "image/x-icon"
	default:
		return "application/octet-stream"
	}
}

// FormatSize renders a byte count for humans.
func FormatSize(bytes int) string {
	switch {
	case bytes < 1024:
		return fmt.Sprintf("%d B", bytes)
	case bytes < 1024*1024:
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	default:
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
	}
}

// ToImageItems filters and enriches object metadata for gallery views.
func ToImageItems(items []ObjectMeta) []ImageItem {
	var out []ImageItem
	for _, item := range items {
		ct := item.ContentType
		if ct == "" || ct == "application/octet-stream" {
			ct = ContentTypeFromKey(item.Key)
		}
		if !IsImageContentType(ct) {
			continue
		}
		modified := item.LastModified
		if modified == "" {
			modified = time.Now().UTC().Format(time.RFC3339)
		}
		out = append(out, ImageItem{
			Key:          item.Key,
			Name:         BaseName(item.Key),
			ContentType:  ct,
			Size:         item.Size,
			SizeHuman:    FormatSize(item.Size),
			LastModified: modified,
		})
	}
	if out == nil {
		out = []ImageItem{}
	}
	return out
}

// RelativeKey strips the configured prefix from a full object key.
func RelativeKey(prefix, objectKey string) string {
	objectKey = strings.TrimPrefix(objectKey, "/")
	prefix = strings.TrimSuffix(prefix, "/")
	if prefix == "" {
		return objectKey
	}
	return strings.TrimPrefix(objectKey, prefix+"/")
}

// S3ObjectURL builds the canonical object URI/HTTPS URL for a stored key.
func S3ObjectURL(backend, bucket, region, objectKey string) string {
	objectKey = strings.TrimPrefix(objectKey, "/")
	if backend == "aws" {
		return "https://" + bucket + ".s3." + region + ".amazonaws.com/" + encodeS3Key(objectKey)
	}
	return "s3://" + bucket + "/" + objectKey
}

func encodeS3Key(key string) string {
	parts := strings.Split(key, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
