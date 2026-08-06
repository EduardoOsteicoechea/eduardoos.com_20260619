package s3store

import (
	"fmt"
	"net/url"
	"path"
	"strings"
	"time"
)

type ImageItem struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	ContentType  string `json:"content_type"`
	Size         int    `json:"size"`
	SizeHuman    string `json:"size_human"`
	LastModified string `json:"last_modified"`
}

func IsImageContentType(ct string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(ct)), "image/")
}

func BaseName(objectKey string) string {
	return path.Base(strings.TrimPrefix(objectKey, "/"))
}

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
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".m4a":
		return "audio/mp4"
	case ".ogg":
		return "audio/ogg"
	default:
		return "application/octet-stream"
	}
}

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

func RelativeKey(prefix, objectKey string) string {
	objectKey = strings.TrimPrefix(objectKey, "/")
	prefix = strings.TrimSuffix(prefix, "/")
	if prefix == "" {
		return objectKey
	}
	return strings.TrimPrefix(objectKey, prefix+"/")
}

func S3ObjectURL(backend, bucket, region, objectKey string) string {
	objectKey = strings.TrimPrefix(objectKey, "/")
	if backend == "aws" {
		return "https://" + bucket + ".s3." + region + ".amazonaws.com/" + encodeS3Key(objectKey)
	}
	return "s3://" + bucket + "/" + objectKey
}

func EncodeRelativePath(key string) string {
	return encodePathSegments(key)
}

func encodeS3Key(key string) string {
	return encodePathSegments(key)
}

func encodePathSegments(key string) string {
	parts := strings.Split(key, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
