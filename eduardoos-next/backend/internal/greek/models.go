package greek

import "time"

// Group is a book/collection card in the Greek builder.
type Group struct {
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	OwnerEmail  string `json:"ownerEmail"`
	S3Prefix    string `json:"s3Prefix"`
	ChapterCount int   `json:"chapterCount"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// ChapterMeta is durable chapter metadata on S3.
type ChapterMeta struct {
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// VerseMeta is durable verse metadata on S3.
type VerseMeta struct {
	Slug      string `json:"slug"`
	Title     string `json:"title"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// WordMeta holds translations, ordinals, letter count, and durable letter-image metadata.
// LetterImages is the source of truth for slug + alphabetNumber; SVGs live beside word.json.
type WordMeta struct {
	Slug           string       `json:"slug"`
	Translation1   string       `json:"translation1"`
	Translation2   string       `json:"translation2"`
	OrdinalChapter int          `json:"ordinalChapter"` // n/1000 within chapter
	OrdinalBook    int          `json:"ordinalBook"`    // n/10000 within book
	LetterCount    int          `json:"letterCount"`
	LetterImages   []LetterMeta `json:"letterImages,omitempty"`
	CreatedAt      string       `json:"createdAt"`
	UpdatedAt      string       `json:"updatedAt"`
}

// LetterMeta is one letter-image slot belonging to a word (ordering + identity).
// AlphabetNumber is in [1, 30] and may use decimal steps (1.1, 1.2) for mid-integer order.
type LetterMeta struct {
	ID             int     `json:"id"`
	Slug           string  `json:"slug"`
	AlphabetNumber float64 `json:"alphabetNumber"`
}

// LetterRef is a listed letter SVG under a word (API/tree view).
type LetterRef struct {
	Index          int     `json:"index"`
	Slug           string  `json:"slug"`
	AlphabetNumber float64 `json:"alphabetNumber"`
	Key            string  `json:"key"`
	URL            string  `json:"url"`
	Size           int64   `json:"size"`
	GallerySlug    string  `json:"gallerySlug,omitempty"`
}

// GalleryGlyph is a reusable letter SVG in the admin gallery under greek/{user}/gallery/.
type GalleryGlyph struct {
	Slug           string  `json:"slug"`
	AlphabetNumber float64 `json:"alphabetNumber"`
	Key            string  `json:"key"`
	URL            string  `json:"url"`
	Size           int64   `json:"size,omitempty"`
	CreatedAt      string  `json:"createdAt,omitempty"`
	UpdatedAt      string  `json:"updatedAt,omitempty"`
}

// GalleryIndex is the durable gallery catalog at gallery/index.json.
type GalleryIndex struct {
	Glyphs    []GalleryGlyph `json:"glyphs"`
	UpdatedAt string         `json:"updatedAt,omitempty"`
}

// WordNode is a word plus its letter images (group detail tree), sorted by alphabetNumber.
type WordNode struct {
	WordMeta
	Letters []LetterRef `json:"letters"`
}

// VerseNode nests words under a verse.
type VerseNode struct {
	VerseMeta
	Words []WordNode `json:"words"`
}

// ChapterNode nests verses under a chapter.
type ChapterNode struct {
	ChapterMeta
	Verses []VerseNode `json:"verses"`
}

// GroupTree is the full hierarchy returned by GET group detail.
type GroupTree struct {
	Group    Group         `json:"group"`
	Chapters []ChapterNode `json:"chapters"`
}

// nowRFC3339 is UTC timestamp for created/updated fields.
func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
