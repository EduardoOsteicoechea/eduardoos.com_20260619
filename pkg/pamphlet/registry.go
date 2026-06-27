package pamphlet

import (
	"context"
	"time"
)

// RegistryEntry is one pamphlet draft owned by a user.
type RegistryEntry struct {
	PamphletID string        `json:"pamphletId"`
	Title      string        `json:"title"`
	UpdatedAt  time.Time     `json:"updatedAt"`
	Layout     LayoutFields  `json:"layout"`
}

// LayoutFields mirrors frontend layout query keys for per-document persistence.
type LayoutFields struct {
	MarginLateral       float64 `json:"marginLateral"`
	MarginVertical      float64 `json:"marginVertical"`
	MidMargin           float64 `json:"midMargin"`
	ColSep              float64 `json:"colSep"`
	HfGap               float64 `json:"hfGap"`
	FontSize            float64 `json:"fontSize"`
	LineHeight          float64 `json:"lineHeight"`
	ParagraphSep        float64 `json:"paragraphSep"`
	HeadingBottomMargin float64 `json:"headingBottomMargin"`
}

// DefaultLayoutFields returns editor default layout numbers.
func DefaultLayoutFields() LayoutFields {
	cfg := DefaultLayoutConfig()
	return LayoutFields{
		MarginLateral: cfg.MarginLateralMM, MarginVertical: cfg.MarginVerticalMM,
		MidMargin: cfg.MidSeparationMM, ColSep: cfg.ColumnGapMM, HfGap: cfg.HeaderFooterGapMM,
		FontSize: cfg.FontSizePt, LineHeight: cfg.LineHeightFactor,
		ParagraphSep: cfg.ParagraphSeparationFactor, HeadingBottomMargin: cfg.IdeaHeadingBottomMarginMM,
	}
}

// RegistryStore lists pamphlet drafts and persists layout settings per draft.
type RegistryStore interface {
	List(ctx context.Context, userID, sort string) ([]RegistryEntry, error)
	GetLayout(ctx context.Context, userID, pamphletID string) (LayoutFields, bool, error)
	SaveLayout(ctx context.Context, userID, pamphletID, title string, layout LayoutFields) error
	BackendName() string
}

// LayoutFieldsToConfig converts persisted layout to engine config.
func LayoutFieldsToConfig(f LayoutFields) LayoutConfig {
	cfg := DefaultLayoutConfig()
	if f.MarginLateral > 0 {
		cfg.MarginLateralMM = f.MarginLateral
	}
	if f.MarginVertical > 0 {
		cfg.MarginVerticalMM = f.MarginVertical
	}
	if f.MidMargin > 0 {
		cfg.MidSeparationMM = f.MidMargin
	}
	if f.ColSep >= 0 {
		cfg.ColumnGapMM = f.ColSep
	}
	if f.HfGap >= 0 {
		cfg.HeaderFooterGapMM = f.HfGap
	}
	if f.FontSize > 0 {
		cfg.FontSizePt = f.FontSize
	}
	if f.LineHeight > 0 {
		cfg.LineHeightFactor = f.LineHeight
	}
	if f.ParagraphSep >= 0 {
		cfg.ParagraphSeparationFactor = f.ParagraphSep
	}
	if f.HeadingBottomMargin >= 0 {
		cfg.IdeaHeadingBottomMarginMM = f.HeadingBottomMargin
	}
	return cfg
}
