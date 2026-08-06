package pamphlet

import "context"

const DefaultPamphletID = "active"

type DocumentStore interface {
	Get(ctx context.Context, userID, pamphletID string) (Document, error)
	Put(ctx context.Context, userID, pamphletID string, doc Document) error
	Reset(ctx context.Context, userID, pamphletID string) (Document, error)
	BackendName() string
}
