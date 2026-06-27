package pamphlet

// BlockKind identifies layout block types produced from JSON.
type BlockKind int

const (
	BlockHeading BlockKind = iota
	BlockParagraph
	BlockList
	BlockQuote
	BlockImage
)

// LayoutBlock is a flattened layout object ready for column flow.
type LayoutBlock struct {
	Kind        BlockKind
	Text        string
	ContentRef  string
	Highlights  []HighlightRange
	References  []string
	ListItems   []ListItem
	Description string
	ImageURL    string
	AspectRatio float64
}

// ListItem is one highlightable bullet inside a list block.
type ListItem struct {
	Text       string
	Highlights []HighlightRange
}

// RegionRect is a rectangular region in millimeters from the page bottom-left.
type RegionRect struct {
	XMM      float64
	YMM      float64
	WidthMM  float64
	HeightMM float64
	Label    string
}

// ColumnSlot tracks one of eight flow columns during distribution.
type ColumnSlot struct {
	Label      string
	WidthMM    float64
	HeightMM   float64
	UsedMM     float64
	Blocks     []LayoutBlock
}

// RemainingMM returns unused vertical space in the column slot.
func (s *ColumnSlot) RemainingMM() float64 {
	return s.HeightMM - s.UsedMM
}
