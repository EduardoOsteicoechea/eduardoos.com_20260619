// Package pdf builds raw PDF byte streams without external PDF libraries.
package pdf

import (
	"fmt"
	"strings"
)

// MmToPoints converts millimeters to PDF points using mm * (72.0 / 25.4).
func MmToPoints(mm float64) float64 { return mm * (72.0 / 25.4) }

// BuildSamplePDF creates a minimal valid PDF with one text line.
func BuildSamplePDF(title string) []byte {
	x := MmToPoints(20)
	y := MmToPoints(270)
	content := fmt.Sprintf("BT /F1 12 Tf %.2f %.2f Td (%s) Tj ET", x, y, escape(title))
	objects := []string{
		"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
		"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
		fmt.Sprintf("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n", MmToPoints(210), MmToPoints(297)),
		fmt.Sprintf("4 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n", len(content), content),
		"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
	}
	pdf := "%PDF-1.4\n"
	offsets := []int{0}
	for _, obj := range objects {
		offsets = append(offsets, len(pdf))
		pdf += obj
	}
	xref := len(pdf)
	pdf += fmt.Sprintf("xref\n0 %d\n", len(objects)+1)
	pdf += "0000000000 65535 f \n"
	for _, off := range offsets[1:] {
		pdf += fmt.Sprintf("%010d 00000 n \n", off)
	}
	pdf += fmt.Sprintf("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return []byte(pdf)
}

func escape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	s = strings.ReplaceAll(s, "(", `\(`)
	return strings.ReplaceAll(s, ")", `\)`)
}
