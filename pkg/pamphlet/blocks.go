package pamphlet

type BlockKind int

const (
	BlockHeading BlockKind = iota
	BlockParagraph
	BlockList
	BlockQuote
	BlockImage
)

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

type ListItem struct {
	Text       string
	Highlights []HighlightRange
}

type RegionRect struct {
	XMM      float64
	YMM      float64
	WidthMM  float64
	HeightMM float64
	Label    string
}

type ColumnSlot struct {
	Label    string
	WidthMM  float64
	HeightMM float64
	UsedMM   float64
	Blocks   []LayoutBlock
}

func (s *ColumnSlot) RemainingMM() float64 {
	return s.HeightMM - s.UsedMM
}
