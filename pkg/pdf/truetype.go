package pdf

// Minimal TrueType parser: cmap (format 4), head, hhea, hmtx — enough to
// emit WinAnsi Widths and embed the TTF as a PDF /FontFile2 stream.
// No external font libraries.

import (
	"encoding/binary"
	"fmt"
)

type ttfFace struct {
	data       []byte
	unitsPerEm uint16
	ascent     int
	descent    int
	capHeight  int
	bbox       [4]int // xmin ymin xmax ymax (font units)
	// widths[b] = glyph advance in 1000ths of an em for WinAnsi byte b.
	widths [256]int
}

func parseTTF(data []byte) (*ttfFace, error) {
	if len(data) < 12 {
		return nil, fmt.Errorf("ttf too small")
	}
	numTables := int(be16(data, 4))
	tables := map[string][2]int{}
	off := 12
	for i := 0; i < numTables; i++ {
		if off+16 > len(data) {
			return nil, fmt.Errorf("ttf table directory truncated")
		}
		tag := string(data[off : off+4])
		to := int(be32(data, off+8))
		tl := int(be32(data, off+12))
		tables[tag] = [2]int{to, tl}
		off += 16
	}
	head := mustTable(tables, "head", data)
	hhea := mustTable(tables, "hhea", data)
	hmtx := mustTable(tables, "hmtx", data)
	maxp := mustTable(tables, "maxp", data)
	cmap := mustTable(tables, "cmap", data)
	if head == nil || hhea == nil || hmtx == nil || maxp == nil || cmap == nil {
		return nil, fmt.Errorf("ttf missing required table")
	}

	face := &ttfFace{data: data}
	face.unitsPerEm = be16(head, 18)
	if face.unitsPerEm == 0 {
		return nil, fmt.Errorf("ttf unitsPerEm is 0")
	}
	face.bbox = [4]int{
		int(int16(be16(head, 36))),
		int(int16(be16(head, 38))),
		int(int16(be16(head, 40))),
		int(int16(be16(head, 42))),
	}
	face.ascent = int(int16(be16(hhea, 4)))
	face.descent = int(int16(be16(hhea, 6)))
	face.capHeight = face.ascent
	if os2 := mustTable(tables, "OS/2", data); os2 != nil && len(os2) >= 90 {
		ver := be16(os2, 0)
		if ver >= 2 {
			face.capHeight = int(int16(be16(os2, 88)))
		}
	}

	numGlyphs := int(be16(maxp, 4))
	nHMetrics := int(be16(hhea, 34))
	advances := make([]int, numGlyphs)
	p := 0
	lastAdv := 0
	for i := 0; i < nHMetrics && p+4 <= len(hmtx); i++ {
		lastAdv = int(be16(hmtx, p))
		if i < numGlyphs {
			advances[i] = lastAdv
		}
		p += 4
	}
	for i := nHMetrics; i < numGlyphs; i++ {
		advances[i] = lastAdv
	}

	gidOf := parseCmapFormat4(cmap)
	for b := 0; b < 256; b++ {
		r := winAnsiRune(byte(b))
		gid := gidOf(r)
		if gid < 0 || gid >= len(advances) {
			face.widths[b] = 0
			continue
		}
		face.widths[b] = advances[gid] * 1000 / int(face.unitsPerEm)
	}
	if face.widths[' '] == 0 {
		face.widths[' '] = 250
	}
	return face, nil
}

func mustTable(tables map[string][2]int, tag string, data []byte) []byte {
	loc, ok := tables[tag]
	if !ok {
		return nil
	}
	o, n := loc[0], loc[1]
	if o < 0 || n < 0 || o+n > len(data) {
		return nil
	}
	return data[o : o+n]
}

func parseCmapFormat4(cmap []byte) func(rune) int {
	none := func(rune) int { return 0 }
	if len(cmap) < 4 {
		return none
	}
	nEnc := int(be16(cmap, 2))
	var fmtOff int
	for i := 0; i < nEnc; i++ {
		rec := 4 + i*8
		if rec+8 > len(cmap) {
			break
		}
		plat := be16(cmap, rec)
		enc := be16(cmap, rec+2)
		sub := int(be32(cmap, rec+4))
		if sub < 0 || sub+2 > len(cmap) {
			continue
		}
		format := be16(cmap, sub)
		if format != 4 {
			continue
		}
		// Prefer Windows Unicode BMP (platform 3, encoding 1).
		if plat == 3 && enc == 1 {
			fmtOff = sub
			break
		}
		if fmtOff == 0 {
			fmtOff = sub
		}
	}
	if fmtOff == 0 {
		return none
	}
	seg := cmap[fmtOff:]
	if len(seg) < 16 {
		return none
	}
	segCount := int(be16(seg, 6) / 2)
	endOff := 14
	startOff := endOff + 2*segCount + 2
	deltaOff := startOff + 2*segCount
	rangeOff := deltaOff + 2*segCount
	if rangeOff+2*segCount > len(seg) {
		return none
	}
	return func(r rune) int {
		if r < 0 || r > 0xFFFF {
			return 0
		}
		cp := int(r)
		for i := 0; i < segCount; i++ {
			end := int(be16(seg, endOff+2*i))
			start := int(be16(seg, startOff+2*i))
			if cp < start || cp > end {
				continue
			}
			ro := int(be16(seg, rangeOff+2*i))
			delta := int(int16(be16(seg, deltaOff+2*i)))
			if ro == 0 {
				g := (cp + delta) & 0xFFFF
				return g
			}
			// glyphId = *(idRangeOffset/2 + (cp-start) + &idRangeOffset[i])
			idx := rangeOff + 2*i + ro + 2*(cp-start)
			if idx+1 >= len(seg) {
				return 0
			}
			g := int(be16(seg, idx))
			if g == 0 {
				return 0
			}
			return (g + delta) & 0xFFFF
		}
		return 0
	}
}

func be16(b []byte, o int) uint16 { return binary.BigEndian.Uint16(b[o:]) }
func be32(b []byte, o int) uint32 { return binary.BigEndian.Uint32(b[o:]) }

func winAnsiRune(b byte) rune {
	switch b {
	case 0x80:
		return '\u20AC'
	case 0x85:
		return '\u2026'
	case 0x91:
		return '\u2018'
	case 0x92:
		return '\u2019'
	case 0x93:
		return '\u201C'
	case 0x94:
		return '\u201D'
	case 0x96:
		return '\u2013'
	case 0x97:
		return '\u2014'
	default:
		return rune(b)
	}
}
