package s3store

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

type persistedStubObject struct {
	DataBase64   string `json:"data_base64"`
	ContentType  string `json:"content_type"`
	LastModified string `json:"last_modified"`
}

type persistedStubSnapshot struct {
	Objects map[string]persistedStubObject `json:"objects"`
}

func (s *stubStore) persistPath() string {
	if s.dataDir == "" {
		return ""
	}
	return filepath.Join(s.dataDir, "stub-objects.json")
}

func (s *stubStore) loadFromDisk() {
	path := s.persistPath()
	if path == "" {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var snap persistedStubSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		return
	}
	for key, item := range snap.Objects {
		data, err := base64.StdEncoding.DecodeString(item.DataBase64)
		if err != nil {
			continue
		}
		modified, err := time.Parse(time.RFC3339, item.LastModified)
		if err != nil {
			modified = time.Now().UTC()
		}
		s.objs[key] = stubObject{
			data:         data,
			contentType:  item.ContentType,
			lastModified: modified,
		}
	}
}

func (s *stubStore) saveToDisk() {
	path := s.persistPath()
	if path == "" {
		return
	}
	snap := persistedStubSnapshot{Objects: map[string]persistedStubObject{}}
	for key, obj := range s.objs {
		snap.Objects[key] = persistedStubObject{
			DataBase64:   base64.StdEncoding.EncodeToString(obj.data),
			ContentType:  obj.contentType,
			LastModified: obj.lastModified.Format(time.RFC3339),
		}
	}
	raw, err := json.Marshal(snap)
	if err != nil {
		return
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	_ = os.WriteFile(path, raw, 0o644)
}
