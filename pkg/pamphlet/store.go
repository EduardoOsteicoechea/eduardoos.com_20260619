package pamphlet

import (
	_ "embed"
	"encoding/json"
	"sync"
)

var embedHeader []byte

var embedContent []byte

var embedFooter []byte

var (
	defaultOnce sync.Once
	defaultDoc  Document
)

func init() {
	loadDefaults(&defaultDoc)
}

func loadDefaults(doc *Document) {
	_ = json.Unmarshal(embedHeader, &doc.Header)
	_ = json.Unmarshal(embedContent, &doc.Content)
	_ = json.Unmarshal(embedFooter, &doc.Footer)
}

func DefaultDocument() Document {
	defaultOnce.Do(func() {})
	return cloneDocument(defaultDoc)
}

func cloneDocument(doc Document) Document {
	raw, _ := json.Marshal(doc)
	var out Document
	_ = json.Unmarshal(raw, &out)
	return out
}

type Store = MemoryStore

func NewStore() *MemoryStore {
	return NewMemoryStore()
}
