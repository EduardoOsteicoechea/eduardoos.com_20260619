package pamphlet

import "context"

// DefaultPamphletID is the single active draft per user until multi-draft UI ships.
const DefaultPamphletID = "active"

// DocumentStore persists pamphlet header, content, and footer JSON per user draft.
type DocumentStore interface {
	Get(ctx context.Context, userID, pamphletID string) (Document, error)
	Put(ctx context.Context, userID, pamphletID string, doc Document) error
	Reset(ctx context.Context, userID, pamphletID string) (Document, error)
	BackendName() string
}
