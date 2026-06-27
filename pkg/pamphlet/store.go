package pamphlet

import (
	_ "embed"
	"encoding/json"
	"sync"
)

//go:embed data/header.json
var embedHeader []byte

//go:embed data/content.json
var embedContent []byte

//go:embed data/footer.json
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

// DefaultDocument returns a copy of the bundled sample pamphlet JSON.
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

// Store is kept as an alias for backward compatibility with tests.
type Store = MemoryStore

// NewStore constructs an in-memory pamphlet document store.
func NewStore() *MemoryStore {
	return NewMemoryStore()
}
