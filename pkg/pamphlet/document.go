package pamphlet

type HighlightRange struct {
	Start int `json:"start"`
	End   int `json:"end"`
}

type HeaderPayload struct {
	Heading    string `json:"heading"`
	Subheading string `json:"subheading"`
	Author     string `json:"author"`
	Date       string `json:"date"`
	Image      string `json:"image"`
	Category   string `json:"category"`
	Text       string `json:"text"`
}

type FooterContact struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type FooterAddress struct {
	Message string `json:"message"`
	Address string `json:"address"`
}

type FooterPayload struct {
	Heading      string          `json:"heading"`
	ContactItems []FooterContact `json:"contact_items"`
	AddressData  FooterAddress   `json:"address_data"`
	Text         string          `json:"text"`
}

type ListItemJSON struct {
	Content    string           `json:"content"`
	Highlights []HighlightRange `json:"highlights"`
}

type SubideaJSON struct {
	Type        string           `json:"type"`
	Content     string           `json:"content"`
	Highlights  []HighlightRange `json:"highlights"`
	References  []string         `json:"references"`
	Items       []ListItemJSON   `json:"items"`
	Description string           `json:"description"`
	Image       string           `json:"image"`
	AspectRatio float64          `json:"aspect_ratio"`
}

type IdeaJSON struct {
	Heading           string           `json:"heading"`
	HeadingHighlights []HighlightRange `json:"heading_highlights"`
	Summary           string           `json:"summary"`
	Subideas          []SubideaJSON    `json:"subideas"`
}

type ContentPayload struct {
	Ideas []IdeaJSON `json:"ideas"`
}

type Document struct {
	Header  HeaderPayload  `json:"header"`
	Content ContentPayload `json:"content"`
	Footer  FooterPayload  `json:"footer"`
}
