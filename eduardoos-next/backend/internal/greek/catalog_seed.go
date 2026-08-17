package greek

import "strings"

// CatalogSeedEntry is one fixed Greek letter-catalog slot.
// AlphabetNumber uses integer n for the letter family (1=Alpha … 24=Omega)
// and n.1 for lowercase (plus 18.2 for final sigma) — see KoineCatalogSeed.
type CatalogSeedEntry struct {
	Slug           string  `json:"slug"`
	Label          string  `json:"label"` // Unicode glyph shown in the UI
	Name           string  `json:"name"`  // English name, e.g. "alpha lower"
	LetterIndex    int     `json:"letterIndex"`
	AlphabetNumber float64 `json:"alphabetNumber"`
	Case           string  `json:"case"`    // upper | lower
	Variant        string  `json:"variant"` // plain | final
}

// EmptyLetterSVG is the undrawn placeholder written when seeding catalog slots.
// Draw/override replaces the same S3 key (gallery/{slug}.svg).
const EmptyLetterSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="64" viewBox="0 0 32 64"><rect width="100%" height="100%" fill="none"/></svg>`

// GlyphHasDrawing reports whether SVG content looks like a drawn letter (not empty placeholder).
func GlyphHasDrawing(svg []byte) bool {
	s := strings.ToLower(string(svg))
	return strings.Contains(s, "<path") || strings.Contains(s, "<polyline") ||
		strings.Contains(s, "<line") || strings.Contains(s, "<circle") ||
		strings.Contains(s, "<ellipse") || strings.Contains(s, "<polygon")
}

// koineLetter is one of the 24 standard Greek alphabet families.
type koineLetter struct {
	index int
	name  string
	upper string
	lower string
}

// standardGreekLetters is Αα…Ωω (24 families). No polytonic / diacritic stacks.
var standardGreekLetters = []koineLetter{
	{1, "alpha", "Α", "α"},
	{2, "beta", "Β", "β"},
	{3, "gamma", "Γ", "γ"},
	{4, "delta", "Δ", "δ"},
	{5, "epsilon", "Ε", "ε"},
	{6, "zeta", "Ζ", "ζ"},
	{7, "eta", "Η", "η"},
	{8, "theta", "Θ", "θ"},
	{9, "iota", "Ι", "ι"},
	{10, "kappa", "Κ", "κ"},
	{11, "lambda", "Λ", "λ"},
	{12, "mu", "Μ", "μ"},
	{13, "nu", "Ν", "ν"},
	{14, "xi", "Ξ", "ξ"},
	{15, "omicron", "Ο", "ο"},
	{16, "pi", "Π", "π"},
	{17, "rho", "Ρ", "ρ"},
	{18, "sigma", "Σ", "σ"},
	{19, "tau", "Τ", "τ"},
	{20, "upsilon", "Υ", "υ"},
	{21, "phi", "Φ", "φ"},
	{22, "chi", "Χ", "χ"},
	{23, "psi", "Ψ", "ψ"},
	{24, "omega", "Ω", "ω"},
}

// KoineCatalogSeed returns the clean standard Greek alphabet catalog:
// 24 uppercase + 24 lowercase (Αα…Ωω), plus final sigma ς (standard form).
// Polytonic / accent-heavy variants are intentionally omitted.
//
// Numbering (49 slots):
//   - Integers 1–24 = uppercase plain (Α=1 … Ω=24)
//   - n.1           = lowercase plain
//   - 18.2          = sigma final (ς) — only extra standard form
func KoineCatalogSeed() []CatalogSeedEntry {
	out := make([]CatalogSeedEntry, 0, 49)
	add := func(letterIndex int, alphabet float64, slug, label, name, caseForm, variant string) {
		out = append(out, CatalogSeedEntry{
			Slug:           slug,
			Label:          label,
			Name:           name,
			LetterIndex:    letterIndex,
			AlphabetNumber: NormalizeAlphabetNumber(alphabet),
			Case:           caseForm,
			Variant:        variant,
		})
	}

	for _, L := range standardGreekLetters {
		n := float64(L.index)
		add(L.index, n, L.name+"-upper", L.upper, L.name+" upper", "upper", "plain")
		add(L.index, n+0.1, L.name+"-lower", L.lower, L.name+" lower", "lower", "plain")
	}
	// Final sigma is part of the normal Greek alphabet (word-final form of σ).
	add(18, 18.2, "sigma-final", "ς", "sigma final", "lower", "final")

	return out
}
