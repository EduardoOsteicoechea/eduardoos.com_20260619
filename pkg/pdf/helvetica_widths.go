package pdf

// Adobe Helvetica / Helvetica-Bold glyph widths in 1000ths of an em
// (WinAnsi / Latin-1). Wrapping with a flat 0.50em average let the page-1
// title stay on one line while the desktop sheet (system-ui 5mm bold) wraps
// to two — leftover empty header band then looked like an extra margin.

var helveticaWidths [256]int
var helveticaBoldWidths [256]int

func init() {
	for i := 0; i < 256; i++ {
		helveticaWidths[i] = 556
		helveticaBoldWidths[i] = 611
	}
	// ASCII 32–126 from Helvetica.afm / Helvetica-Bold.afm
	copy(helveticaWidths[32:], []int{
		278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
		556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
		1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
		667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
		333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
		556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
	})
	copy(helveticaBoldWidths[32:], []int{
		278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
		556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
		975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
		667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
		333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
		611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
	})
	overlayLatin1(&helveticaWidths, false)
	overlayLatin1(&helveticaBoldWidths, true)
}

func overlayLatin1(w *[256]int, bold bool) {
	space := w[32]
	w[0xA0] = space // nbsp
	w[0xA1] = w['!']
	w[0xBF] = w['?']
	w[0xAB], w[0xBB] = 556, 556
	w[0x91], w[0x92] = 278, 278
	w[0x93], w[0x94] = 500, 500
	w[0x96] = 556
	w[0x97] = 1000
	w[0x85] = 1000
	w[0x80] = 556
	pair := func(accented byte, base byte) { w[accented] = w[base] }
	pair(0xE1, 'a')
	pair(0xE9, 'e')
	pair(0xED, 'i')
	pair(0xF3, 'o')
	pair(0xFA, 'u')
	pair(0xF1, 'n')
	pair(0xE0, 'a')
	pair(0xE2, 'a')
	pair(0xE7, 'c')
	pair(0xFC, 'u')
	pair(0xC1, 'A')
	pair(0xC9, 'E')
	pair(0xCD, 'I')
	pair(0xD3, 'O')
	pair(0xDA, 'U')
	pair(0xD1, 'N')
	pair(0xC7, 'C')
	pair(0xDC, 'U')
	_ = bold
}

func glyphWidthEm(b byte, bold bool) float64 {
	w := helveticaWidths[b]
	if bold {
		w = helveticaBoldWidths[b]
	}
	if w <= 0 {
		w = 600
	}
	return float64(w) / 1000.0
}

func stringWidthPt(s string, sizePt float64, bold bool) float64 {
	total := 0.0
	for i := 0; i < len(s); i++ {
		total += glyphWidthEm(s[i], bold) * sizePt
	}
	return total
}
