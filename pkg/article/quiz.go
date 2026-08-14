package article

// Article helpers: flatten pamphlet JSON into readable plain text, content hashing,
// and quiz document shapes stored beside .epam objects in S3.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// QuizDocument is persisted at media/epams/{user}/{epamId}.quiz.json
type QuizDocument struct {
	EpamID      string         `json:"epamId"`
	ContentHash string         `json:"contentHash"`
	GeneratedAt string         `json:"generatedAt"`
	Questions   []QuizQuestion `json:"questions"`
}

type QuizQuestion struct {
	ID           string   `json:"id"`
	Prompt       string   `json:"prompt"`
	Choices      []string `json:"choices"`
	AnswerIndex  int      `json:"answerIndex"`
	Explanation  string   `json:"explanation"`
}

// PamphletLite is enough of the .epam body to extract article text and blocks.
type PamphletLite struct {
	Type   string `json:"type"`
	ID     string `json:"id"`
	Header struct {
		Title         string `json:"title"`
		Subtitle      string `json:"subtitle"`
		Author        string `json:"author"`
		Series        string `json:"series"`
		SeriesChapter string `json:"series_chapter"`
		Date          string `json:"date"`
	} `json:"header"`
	Footer struct {
		Items []Item `json:"items"`
	} `json:"footer"`
	Column1 []Item `json:"column_1"`
	Column2 []Item `json:"column_2"`
	Column3 []Item `json:"column_3"`
	Column4 []Item `json:"column_4"`
	Column5 []Item `json:"column_5"`
	Column6 []Item `json:"column_6"`
	Column7 []Item `json:"column_7"`
	Column8 []Item `json:"column_8"`
}

type Item struct {
	Type     string  `json:"type"`
	Content  string  `json:"content"`
	HeightMm float64 `json:"height_mm"`
}

// Block is one rendered article segment for the frontend.
type Block struct {
	Type    string `json:"type"` // heading_1 | paragraph | image | meta
	Content string `json:"content"`
}

// QuizObjectKey builds the absolute S3 key for quiz JSON beside the .epam.
func QuizObjectKey(userID, epamID string) string {
	safeUser := strings.ReplaceAll(strings.TrimSpace(userID), "@", "_at_")
	safeUser = strings.ReplaceAll(safeUser, "/", "_")
	return fmt.Sprintf("media/epams/%s/%s.quiz.json", safeUser, epamID)
}

func ParsePamphlet(raw []byte) (PamphletLite, error) {
	var doc PamphletLite
	if err := json.Unmarshal(raw, &doc); err != nil {
		return PamphletLite{}, err
	}
	return doc, nil
}

// BlocksInReadingOrder returns header title + body columns 1–8 + footer text/images.
func BlocksInReadingOrder(doc PamphletLite) []Block {
	var out []Block
	if t := strings.TrimSpace(doc.Header.Title); t != "" {
		out = append(out, Block{Type: "heading_1", Content: t})
	}
	metaBits := []string{}
	for _, s := range []string{doc.Header.Subtitle, doc.Header.Author, doc.Header.Series, doc.Header.SeriesChapter, doc.Header.Date} {
		if strings.TrimSpace(s) != "" {
			metaBits = append(metaBits, strings.TrimSpace(s))
		}
	}
	if len(metaBits) > 0 {
		out = append(out, Block{Type: "meta", Content: strings.Join(metaBits, " · ")})
	}
	for _, col := range [][]Item{
		doc.Column1, doc.Column2, doc.Column3, doc.Column4,
		doc.Column5, doc.Column6, doc.Column7, doc.Column8,
		doc.Footer.Items,
	} {
		for _, it := range col {
			t := strings.TrimSpace(it.Type)
			c := strings.TrimSpace(it.Content)
			if t == "" || c == "" {
				continue
			}
			if t != "paragraph" && t != "heading_1" && t != "image" {
				continue
			}
			out = append(out, Block{Type: t, Content: c})
		}
	}
	return out
}

// PlainText extracts non-image text for hashing and LLM context.
func PlainText(doc PamphletLite) string {
	var b strings.Builder
	for _, block := range BlocksInReadingOrder(doc) {
		if block.Type == "image" {
			continue
		}
		b.WriteString(block.Content)
		b.WriteString("\n\n")
	}
	return strings.TrimSpace(b.String())
}

func ContentHash(text string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(text)))
	return hex.EncodeToString(sum[:])
}

func NewQuizDocument(epamID, hash string, questions []QuizQuestion) QuizDocument {
	for i := range questions {
		if questions[i].ID == "" {
			questions[i].ID = fmt.Sprintf("q%d", i+1)
		}
		if questions[i].AnswerIndex < 0 || questions[i].AnswerIndex >= len(questions[i].Choices) {
			questions[i].AnswerIndex = 0
		}
	}
	return QuizDocument{
		EpamID:      epamID,
		ContentHash: hash,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Questions:   questions,
	}
}
