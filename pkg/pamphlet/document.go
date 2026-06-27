package pamphlet

// HighlightRange marks a bold span inside editable pamphlet text.
type HighlightRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

// HeaderPayload is structured header.json content for sheet 1.
type HeaderPayload struct {
	Heading    string `json:"heading"`
	Subheading string `json:"subheading"`
	Author     string `json:"author"`
	Date       string `json:"date"`
	Image      string `json:"image"`
	Category   string `json:"category"`
	Text       string `json:"text"`
}

// FooterContact is one footer contact line.
type FooterContact struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

// FooterAddress groups footer address copy.
type FooterAddress struct {
	Message string `json:"message"`
	Address string `json:"address"`
}

// FooterPayload is structured footer.json content for sheet 1.
type FooterPayload struct {
	Heading      string          `json:"heading"`
	ContactItems []FooterContact `json:"contact_items"`
	AddressData  FooterAddress   `json:"address_data"`
	Text         string          `json:"text"`
}

// ListItemJSON is one bullet in a list subidea.
type ListItemJSON struct {
	Content    string           `json:"content"`
	Highlights []HighlightRange `json:"highlights"`
}

// SubideaJSON is one content block inside an idea.
type SubideaJSON struct {
	Type         string           `json:"type"`
	Content      string           `json:"content"`
	Highlights   []HighlightRange `json:"highlights"`
	References   []string         `json:"references"`
	Items        []ListItemJSON   `json:"items"`
	Description  string           `json:"description"`
	Image        string           `json:"image"`
	AspectRatio  float64          `json:"aspect_ratio"`
}

// IdeaJSON groups heading + subideas in content.json.
type IdeaJSON struct {
	Heading            string           `json:"heading"`
	HeadingHighlights  []HighlightRange `json:"heading_highlights"`
	Summary            string           `json:"summary"`
	Subideas           []SubideaJSON    `json:"subideas"`
}

// ContentPayload is the full content.json document root.
type ContentPayload struct {
	Ideas []IdeaJSON `json:"ideas"`
}

// Document bundles the three pamphlet JSON inputs used by the layout engine.
type Document struct {
	Header  HeaderPayload  `json:"header"`
	Content ContentPayload `json:"content"`
	Footer  FooterPayload  `json:"footer"`
}
