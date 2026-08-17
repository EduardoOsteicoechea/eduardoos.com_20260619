package greek

import "strings"

// CatalogSeedEntry is one fixed Koine Greek letter-catalog slot.
// AlphabetNumber uses integer n for the letter family (1=Alpha … 24=Omega)
// and n.k decimals for case/diacritic variants (see KoineCatalogSeed).
type CatalogSeedEntry struct {
	Slug           string  `json:"slug"`
	Label          string  `json:"label"` // Unicode glyph shown in the UI
	Name           string  `json:"name"`  // English name, e.g. "alpha smooth"
	LetterIndex    int     `json:"letterIndex"`
	AlphabetNumber float64 `json:"alphabetNumber"`
	Case           string  `json:"case"`    // upper | lower
	Variant        string  `json:"variant"` // plain | smooth | rough | …
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

// KoineCatalogSeed returns the full fixed catalog: uppercase, lowercase, and
// curated accent/diacritic variants for Koine Greek (Αα…Ωω).
//
// Numbering:
//   - Integers 1–24 = letter family (Alpha=1 … Omega=24)
//   - n     = uppercase plain
//   - n.1   = lowercase plain
//   - n.2…  = accented / special forms for that letter (max n.9)
func KoineCatalogSeed() []CatalogSeedEntry {
	out := make([]CatalogSeedEntry, 0, 160)
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

	// --- 1 Alpha ---
	add(1, 1.0, "alpha-upper", "Α", "alpha upper", "upper", "plain")
	add(1, 1.1, "alpha-lower", "α", "alpha lower", "lower", "plain")
	add(1, 1.2, "alpha-smooth", "ἀ", "alpha smooth", "lower", "smooth")
	add(1, 1.3, "alpha-rough", "ἁ", "alpha rough", "lower", "rough")
	add(1, 1.4, "alpha-acute", "ά", "alpha acute", "lower", "acute")
	add(1, 1.5, "alpha-grave", "ὰ", "alpha grave", "lower", "grave")
	add(1, 1.6, "alpha-circumflex", "ᾶ", "alpha circumflex", "lower", "circumflex")
	add(1, 1.7, "alpha-smooth-acute", "ἄ", "alpha smooth acute", "lower", "smooth-acute")
	add(1, 1.8, "alpha-rough-acute", "ἅ", "alpha rough acute", "lower", "rough-acute")
	add(1, 1.9, "alpha-iota-sub", "ᾳ", "alpha iota subscript", "lower", "iota-sub")

	// --- 2 Beta ---
	add(2, 2.0, "beta-upper", "Β", "beta upper", "upper", "plain")
	add(2, 2.1, "beta-lower", "β", "beta lower", "lower", "plain")

	// --- 3 Gamma ---
	add(3, 3.0, "gamma-upper", "Γ", "gamma upper", "upper", "plain")
	add(3, 3.1, "gamma-lower", "γ", "gamma lower", "lower", "plain")

	// --- 4 Delta ---
	add(4, 4.0, "delta-upper", "Δ", "delta upper", "upper", "plain")
	add(4, 4.1, "delta-lower", "δ", "delta lower", "lower", "plain")

	// --- 5 Epsilon ---
	add(5, 5.0, "epsilon-upper", "Ε", "epsilon upper", "upper", "plain")
	add(5, 5.1, "epsilon-lower", "ε", "epsilon lower", "lower", "plain")
	add(5, 5.2, "epsilon-smooth", "ἐ", "epsilon smooth", "lower", "smooth")
	add(5, 5.3, "epsilon-rough", "ἑ", "epsilon rough", "lower", "rough")
	add(5, 5.4, "epsilon-acute", "έ", "epsilon acute", "lower", "acute")
	add(5, 5.5, "epsilon-grave", "ὲ", "epsilon grave", "lower", "grave")
	add(5, 5.6, "epsilon-smooth-acute", "ἔ", "epsilon smooth acute", "lower", "smooth-acute")
	add(5, 5.7, "epsilon-rough-acute", "ἕ", "epsilon rough acute", "lower", "rough-acute")

	// --- 6 Zeta ---
	add(6, 6.0, "zeta-upper", "Ζ", "zeta upper", "upper", "plain")
	add(6, 6.1, "zeta-lower", "ζ", "zeta lower", "lower", "plain")

	// --- 7 Eta ---
	add(7, 7.0, "eta-upper", "Η", "eta upper", "upper", "plain")
	add(7, 7.1, "eta-lower", "η", "eta lower", "lower", "plain")
	add(7, 7.2, "eta-smooth", "ἠ", "eta smooth", "lower", "smooth")
	add(7, 7.3, "eta-rough", "ἡ", "eta rough", "lower", "rough")
	add(7, 7.4, "eta-acute", "ή", "eta acute", "lower", "acute")
	add(7, 7.5, "eta-grave", "ὴ", "eta grave", "lower", "grave")
	add(7, 7.6, "eta-circumflex", "ῆ", "eta circumflex", "lower", "circumflex")
	add(7, 7.7, "eta-smooth-acute", "ἤ", "eta smooth acute", "lower", "smooth-acute")
	add(7, 7.8, "eta-rough-acute", "ἥ", "eta rough acute", "lower", "rough-acute")
	add(7, 7.9, "eta-iota-sub", "ῃ", "eta iota subscript", "lower", "iota-sub")

	// --- 8 Theta ---
	add(8, 8.0, "theta-upper", "Θ", "theta upper", "upper", "plain")
	add(8, 8.1, "theta-lower", "θ", "theta lower", "lower", "plain")

	// --- 9 Iota ---
	add(9, 9.0, "iota-upper", "Ι", "iota upper", "upper", "plain")
	add(9, 9.1, "iota-lower", "ι", "iota lower", "lower", "plain")
	add(9, 9.2, "iota-smooth", "ἰ", "iota smooth", "lower", "smooth")
	add(9, 9.3, "iota-rough", "ἱ", "iota rough", "lower", "rough")
	add(9, 9.4, "iota-acute", "ί", "iota acute", "lower", "acute")
	add(9, 9.5, "iota-grave", "ὶ", "iota grave", "lower", "grave")
	add(9, 9.6, "iota-circumflex", "ῖ", "iota circumflex", "lower", "circumflex")
	add(9, 9.7, "iota-diaeresis", "ϊ", "iota diaeresis", "lower", "diaeresis")
	add(9, 9.8, "iota-smooth-acute", "ἴ", "iota smooth acute", "lower", "smooth-acute")
	add(9, 9.9, "iota-rough-acute", "ἵ", "iota rough acute", "lower", "rough-acute")

	// --- 10 Kappa ---
	add(10, 10.0, "kappa-upper", "Κ", "kappa upper", "upper", "plain")
	add(10, 10.1, "kappa-lower", "κ", "kappa lower", "lower", "plain")

	// --- 11 Lambda ---
	add(11, 11.0, "lambda-upper", "Λ", "lambda upper", "upper", "plain")
	add(11, 11.1, "lambda-lower", "λ", "lambda lower", "lower", "plain")

	// --- 12 Mu ---
	add(12, 12.0, "mu-upper", "Μ", "mu upper", "upper", "plain")
	add(12, 12.1, "mu-lower", "μ", "mu lower", "lower", "plain")

	// --- 13 Nu ---
	add(13, 13.0, "nu-upper", "Ν", "nu upper", "upper", "plain")
	add(13, 13.1, "nu-lower", "ν", "nu lower", "lower", "plain")

	// --- 14 Xi ---
	add(14, 14.0, "xi-upper", "Ξ", "xi upper", "upper", "plain")
	add(14, 14.1, "xi-lower", "ξ", "xi lower", "lower", "plain")

	// --- 15 Omicron ---
	add(15, 15.0, "omicron-upper", "Ο", "omicron upper", "upper", "plain")
	add(15, 15.1, "omicron-lower", "ο", "omicron lower", "lower", "plain")
	add(15, 15.2, "omicron-smooth", "ὀ", "omicron smooth", "lower", "smooth")
	add(15, 15.3, "omicron-rough", "ὁ", "omicron rough", "lower", "rough")
	add(15, 15.4, "omicron-acute", "ό", "omicron acute", "lower", "acute")
	add(15, 15.5, "omicron-grave", "ὸ", "omicron grave", "lower", "grave")
	add(15, 15.6, "omicron-smooth-acute", "ὄ", "omicron smooth acute", "lower", "smooth-acute")
	add(15, 15.7, "omicron-rough-acute", "ὅ", "omicron rough acute", "lower", "rough-acute")

	// --- 16 Pi ---
	add(16, 16.0, "pi-upper", "Π", "pi upper", "upper", "plain")
	add(16, 16.1, "pi-lower", "π", "pi lower", "lower", "plain")

	// --- 17 Rho ---
	add(17, 17.0, "rho-upper", "Ρ", "rho upper", "upper", "plain")
	add(17, 17.1, "rho-lower", "ρ", "rho lower", "lower", "plain")
	add(17, 17.2, "rho-rough", "ῥ", "rho rough", "lower", "rough")
	add(17, 17.3, "rho-smooth", "ῤ", "rho smooth", "lower", "smooth")

	// --- 18 Sigma ---
	add(18, 18.0, "sigma-upper", "Σ", "sigma upper", "upper", "plain")
	add(18, 18.1, "sigma-lower", "σ", "sigma lower", "lower", "plain")
	add(18, 18.2, "sigma-final", "ς", "sigma final", "lower", "final")

	// --- 19 Tau ---
	add(19, 19.0, "tau-upper", "Τ", "tau upper", "upper", "plain")
	add(19, 19.1, "tau-lower", "τ", "tau lower", "lower", "plain")

	// --- 20 Upsilon ---
	add(20, 20.0, "upsilon-upper", "Υ", "upsilon upper", "upper", "plain")
	add(20, 20.1, "upsilon-lower", "υ", "upsilon lower", "lower", "plain")
	add(20, 20.2, "upsilon-smooth", "ὐ", "upsilon smooth", "lower", "smooth")
	add(20, 20.3, "upsilon-rough", "ὑ", "upsilon rough", "lower", "rough")
	add(20, 20.4, "upsilon-acute", "ύ", "upsilon acute", "lower", "acute")
	add(20, 20.5, "upsilon-grave", "ὺ", "upsilon grave", "lower", "grave")
	add(20, 20.6, "upsilon-circumflex", "ῦ", "upsilon circumflex", "lower", "circumflex")
	add(20, 20.7, "upsilon-diaeresis", "ϋ", "upsilon diaeresis", "lower", "diaeresis")
	add(20, 20.8, "upsilon-smooth-acute", "ὔ", "upsilon smooth acute", "lower", "smooth-acute")
	add(20, 20.9, "upsilon-rough-acute", "ὕ", "upsilon rough acute", "lower", "rough-acute")

	// --- 21 Phi ---
	add(21, 21.0, "phi-upper", "Φ", "phi upper", "upper", "plain")
	add(21, 21.1, "phi-lower", "φ", "phi lower", "lower", "plain")

	// --- 22 Chi ---
	add(22, 22.0, "chi-upper", "Χ", "chi upper", "upper", "plain")
	add(22, 22.1, "chi-lower", "χ", "chi lower", "lower", "plain")

	// --- 23 Psi ---
	add(23, 23.0, "psi-upper", "Ψ", "psi upper", "upper", "plain")
	add(23, 23.1, "psi-lower", "ψ", "psi lower", "lower", "plain")

	// --- 24 Omega ---
	add(24, 24.0, "omega-upper", "Ω", "omega upper", "upper", "plain")
	add(24, 24.1, "omega-lower", "ω", "omega lower", "lower", "plain")
	add(24, 24.2, "omega-smooth", "ὠ", "omega smooth", "lower", "smooth")
	add(24, 24.3, "omega-rough", "ὡ", "omega rough", "lower", "rough")
	add(24, 24.4, "omega-acute", "ώ", "omega acute", "lower", "acute")
	add(24, 24.5, "omega-grave", "ὼ", "omega grave", "lower", "grave")
	add(24, 24.6, "omega-circumflex", "ῶ", "omega circumflex", "lower", "circumflex")
	add(24, 24.7, "omega-smooth-acute", "ὤ", "omega smooth acute", "lower", "smooth-acute")
	add(24, 24.8, "omega-rough-acute", "ὥ", "omega rough acute", "lower", "rough-acute")
	add(24, 24.9, "omega-iota-sub", "ῳ", "omega iota subscript", "lower", "iota-sub")

	return out
}
