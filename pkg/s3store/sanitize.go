package s3store

import (
	"bytes"
	"errors"
	"fmt"
	"path"
	"strings"
)

var (
	// ErrEmptyAsset is returned when uploaded bytes are zero-length.
	ErrEmptyAsset = errors.New("asset is empty")
	// ErrDisallowedExtension is returned for unsupported file extensions.
	ErrDisallowedExtension = errors.New("extension not allowed")
	// ErrContentMismatch is returned when magic bytes disagree with the extension.
	ErrContentMismatch = errors.New("file content does not match extension")
	// ErrInvalidFilename is returned for unsafe or empty filenames.
	ErrInvalidFilename = errors.New("invalid filename")
)

// allowedExt maps lowercase extensions to canonical MIME types.
var allowedExt = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
	".bmp":  "image/bmp",
	".tif":  "image/tiff",
	".tiff": "image/tiff",
	".ico":  "image/x-icon",
	".svg":  "image/svg+xml",
	".pdf":  "application/pdf",
	".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	".mp3":  "audio/mpeg",
	".wav":  "audio/wav",
	".m4a":  "audio/mp4",
	".aac":  "audio/aac",
	".ogg":  "audio/ogg",
	".mp4":  "video/mp4",
	".m4v":  "video/mp4",
	".mov":  "video/quicktime",
	".webm": "video/webm",
}

// SanitizeFilename returns a basename safe for object keys.
func SanitizeFilename(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, `/\`) {
		return "", ErrInvalidFilename
	}
	base := path.Base(name)
	if base == "" || base == "." || base == ".." {
		return "", ErrInvalidFilename
	}
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			continue
		}
		return "", ErrInvalidFilename
	}
	return base, nil
}

// SanitizeAsset validates filename, size, extension whitelist, and magic-byte composition.
func SanitizeAsset(filename string, data []byte) (string, error) {
	if len(data) == 0 {
		return "", ErrEmptyAsset
	}
	name, err := SanitizeFilename(filename)
	if err != nil {
		return "", err
	}
	ext := strings.ToLower(path.Ext(name))
	mime, ok := allowedExt[ext]
	if !ok {
		return "", fmt.Errorf("%w: %s", ErrDisallowedExtension, ext)
	}
	if !contentMatchesExt(data, ext) {
		return "", ErrContentMismatch
	}
	return mime, nil
}

func contentMatchesExt(data []byte, ext string) bool {
	switch ext {
	case ".png":
		return bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})
	case ".jpg", ".jpeg":
		return len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF
	case ".gif":
		return bytes.HasPrefix(data, []byte("GIF87a")) || bytes.HasPrefix(data, []byte("GIF89a"))
	case ".webp":
		return len(data) >= 12 && bytes.HasPrefix(data, []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP"))
	case ".bmp":
		return bytes.HasPrefix(data, []byte("BM"))
	case ".tif", ".tiff":
		return bytes.HasPrefix(data, []byte{0x49, 0x49, 0x2A, 0x00}) ||
			bytes.HasPrefix(data, []byte{0x4D, 0x4D, 0x00, 0x2A})
	case ".ico":
		return len(data) >= 4 && data[0] == 0x00 && data[1] == 0x00 && data[2] == 0x01 && data[3] == 0x00
	case ".svg":
		trim := bytes.TrimSpace(data)
		return bytes.Contains(trim, []byte("<svg")) || (bytes.HasPrefix(trim, []byte("<?xml")) && bytes.Contains(trim, []byte("<svg")))
	case ".pdf":
		return bytes.HasPrefix(data, []byte("%PDF"))
	case ".docx":
		return isDocx(data)
	case ".xlsx":
		return isXlsx(data)
	case ".mp3":
		return bytes.HasPrefix(data, []byte("ID3")) ||
			(len(data) >= 2 && data[0] == 0xFF && (data[1]&0xE0) == 0xE0)
	case ".wav":
		return len(data) >= 12 && bytes.HasPrefix(data, []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WAVE"))
	case ".m4a", ".aac":
		return isMP4Family(data)
	case ".ogg":
		return bytes.HasPrefix(data, []byte("OggS"))
	case ".mp4", ".m4v", ".mov":
		return isMP4Family(data)
	case ".webm":
		return bytes.HasPrefix(data, []byte{0x1A, 0x45, 0xDF, 0xA3})
	default:
		return false
	}
}

func isZipArchive(data []byte) bool {
	return bytes.HasPrefix(data, []byte{0x50, 0x4B, 0x03, 0x04})
}

func isDocx(data []byte) bool {
	return isZipArchive(data) && bytes.Contains(data, []byte("word/"))
}

func isXlsx(data []byte) bool {
	return isZipArchive(data) && bytes.Contains(data, []byte("xl/"))
}

func isMP4Family(data []byte) bool {
	if len(data) < 12 {
		return false
	}
	return bytes.Equal(data[4:8], []byte("ftyp"))
}

// PrepareUpload validates and returns the safe key and MIME type for storage.
func PrepareUpload(filename string, data []byte) (key, contentType string, err error) {
	key, err = SanitizeFilename(filename)
	if err != nil {
		return "", "", err
	}
	contentType, err = SanitizeAsset(key, data)
	if err != nil {
		return "", "", err
	}
	if err := ValidateKey(key); err != nil {
		return "", "", err
	}
	return key, contentType, nil
}
