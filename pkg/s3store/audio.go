package s3store

import (
	"strings"
	"time"
)

// AudioItem is a playlist-library-ready object with display metadata.
type AudioItem struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	ContentType  string `json:"content_type"`
	Size         int    `json:"size"`
	SizeHuman    string `json:"size_human"`
	LastModified string `json:"last_modified"`
}

// IsAudioContentType reports whether ct is an audio MIME type.
func IsAudioContentType(ct string) bool {
	ct = strings.ToLower(strings.TrimSpace(ct))
	return strings.HasPrefix(ct, "audio/") || ct == "application/ogg"
}

// ToAudioItems filters object metadata down to playable audio files.
func ToAudioItems(items []ObjectMeta) []AudioItem {
	var out []AudioItem
	for _, item := range items {
		ct := item.ContentType
		if ct == "" || ct == "application/octet-stream" {
			ct = ContentTypeFromKey(item.Key)
		}
		if !IsAudioContentType(ct) {
			continue
		}
		modified := item.LastModified
		if modified == "" {
			modified = time.Now().UTC().Format(time.RFC3339)
		}
		out = append(out, AudioItem{
			Key:          item.Key,
			Name:         BaseName(item.Key),
			ContentType:  ct,
			Size:         item.Size,
			SizeHuman:    FormatSize(item.Size),
			LastModified: modified,
		})
	}
	if out == nil {
		out = []AudioItem{}
	}
	return out
}
