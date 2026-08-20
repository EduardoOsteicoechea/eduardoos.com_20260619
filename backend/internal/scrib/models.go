package scrib

// LayerIDs are the six fixed drawing layers (z-order ascending).
var LayerIDs = []string{
	"chapter",
	"verse",
	"word",
	"original",
	"translation1",
	"translation2",
}

// LayerLabels are human-readable Spanish labels for the UI.
var LayerLabels = map[string]string{
	"chapter":      "Número de capítulo",
	"verse":        "Número de versículo",
	"word":         "Número de palabra",
	"original":     "Texto original",
	"translation1": "Traducción 1",
	"translation2": "Traducción 2",
}

// StrokePath is one freehand SVG path on a layer.
type StrokePath struct {
	D           string  `json:"d"`
	StrokeWidth float64 `json:"strokeWidth"`
}

// Layer holds opacity and path list for one Scrib layer.
type Layer struct {
	ID      string       `json:"id"`
	Opacity float64      `json:"opacity"`
	Paths   []StrokePath `json:"paths"`
}

// SheetMeta is a lightweight sheet card inside a book.
type SheetMeta struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
}

// BookMeta is a lightweight book card inside the library.
type BookMeta struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updatedAt"`
}

// Library is the per-user book index.
type Library struct {
	Books []BookMeta `json:"books"`
}

// Book holds metadata and the sheet card list.
type Book struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Sheets    []SheetMeta `json:"sheets"`
	CreatedAt string      `json:"createdAt"`
	UpdatedAt string      `json:"updatedAt"`
}

// Sheet is the full editable sheet document (layers + stroke prefs).
type Sheet struct {
	ID            string  `json:"id"`
	BookID        string  `json:"bookId"`
	Name          string  `json:"name"`
	ActiveLayerID string  `json:"activeLayerId"`
	StrokeWidthMm float64 `json:"strokeWidthMm"`
	Layers        []Layer `json:"layers"`
	UpdatedAt     string  `json:"updatedAt"`
}

// EmptyLayers returns the six default empty layers at full opacity.
func EmptyLayers() []Layer {
	out := make([]Layer, 0, len(LayerIDs))
	for _, id := range LayerIDs {
		out = append(out, Layer{ID: id, Opacity: 1, Paths: []StrokePath{}})
	}
	return out
}

// IsLayerID reports whether id is one of the six fixed layers.
func IsLayerID(id string) bool {
	for _, known := range LayerIDs {
		if known == id {
			return true
		}
	}
	return false
}

// NewEmptySheet builds a blank sheet with defaults.
func NewEmptySheet(bookID, sheetID, name, now string) Sheet {
	return Sheet{
		ID:            sheetID,
		BookID:        bookID,
		Name:          name,
		ActiveLayerID: "chapter",
		StrokeWidthMm: 0.35,
		Layers:        EmptyLayers(),
		UpdatedAt:     now,
	}
}
