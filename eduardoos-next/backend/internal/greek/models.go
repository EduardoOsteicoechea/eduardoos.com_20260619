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

// WordMeta holds translations, ordinals, and letter count for one word.
type WordMeta struct {
	Slug            string `json:"slug"`
	Translation1    string `json:"translation1"`
	Translation2    string `json:"translation2"`
	OrdinalChapter  int    `json:"ordinalChapter"` // n/1000 within chapter
	OrdinalBook     int    `json:"ordinalBook"`    // n/10000 within book
	LetterCount     int    `json:"letterCount"`
	CreatedAt       string `json:"createdAt"`
	UpdatedAt       string `json:"updatedAt"`
}

// LetterRef is a listed letter SVG under a word.
type LetterRef struct {
	Index int    `json:"index"`
	Key   string `json:"key"`
	URL   string `json:"url"`
	Size  int64  `json:"size"`
}

// WordNode is a word plus its letter images (group detail tree).
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
