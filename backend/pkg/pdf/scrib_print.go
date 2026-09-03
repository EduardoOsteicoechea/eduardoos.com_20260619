// Package pdf — Scrib sheet print: one portrait US Letter page with a full-bleed
// client-captured JPEG (spec 024). The FE always sends a light grayscale raster;
// this builder wraps it without re-drawing strokes.
package pdf

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	_ "image/png"
	"image/jpeg"
)

// Scrib sheet geometry matches the editor (portrait US Letter).
const (
	ScribPageWidthMm  = 215.9
	ScribPageHeightMm = 279.4
)

// BuildScribPrintPDF embeds a full-page JPEG (or PNG decoded→JPEG) on one
// portrait US Letter page. Incoming pixels should already be light grayscale;
// any color is forced to grayscale before embed as a safety net.
func BuildScribPrintPDF(imageBytes []byte) ([]byte, error) {
	jpegBytes, w, h, err := normalizePrintJPEG(imageBytes)
	if err != nil {
		return nil, err
	}

	pageW := MmToPoints(ScribPageWidthMm)
	pageH := MmToPoints(ScribPageHeightMm)

	// Object layout: 1 Catalog, 2 Pages, 3 Page, 4 Contents, 5 Image XObject.
	var objs [][]byte
	objs = append(objs, []byte("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"))
	objs = append(objs, []byte("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"))
	objs = append(objs, []byte(fmt.Sprintf(
		"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n",
		pageW, pageH,
	)))

	// Draw image full-bleed: PDF y grows up; scale to page box.
	content := fmt.Sprintf("q\n%.2f 0 0 %.2f 0 0 cm\n/Im0 Do\nQ\n", pageW, pageH)
	objs = append(objs, buildStreamObject(4, content))
	objs = append(objs, buildJPEGXObject(5, pdfImage{
		jpeg:   jpegBytes,
		width:  w,
		height: h,
	}))

	return assemblePDF(objs), nil
}

func normalizePrintJPEG(raw []byte) (jpegBytes []byte, w, h int, err error) {
	raw = bytes.TrimSpace(raw)
	img, _, decErr := image.Decode(bytes.NewReader(raw))
	if decErr != nil {
		// Try as JPEG config-only path when decode fails oddly.
		if isJPEG(raw) {
			if cw, ch, ok := jpegSize(raw); ok {
				return raw, cw, ch, nil
			}
		}
		return nil, 0, 0, fmt.Errorf("decode print image: %w", decErr)
	}
	gray := toGrayImage(img)
	var buf bytes.Buffer
	if encErr := jpeg.Encode(&buf, gray, &jpeg.Options{Quality: 92}); encErr != nil {
		return nil, 0, 0, encErr
	}
	b := gray.Bounds()
	return buf.Bytes(), b.Dx(), b.Dy(), nil
}

func toGrayImage(src image.Image) *image.Gray {
	b := src.Bounds()
	out := image.NewGray(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			out.Set(x, y, color.GrayModel.Convert(src.At(x, y)))
		}
	}
	return out
}

func assemblePDF(objs [][]byte) []byte {
	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objs)+1)
	for i, obj := range objs {
		offsets[i+1] = buf.Len()
		buf.Write(obj)
	}
	xrefStart := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objs)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objs); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n",
		len(objs)+1, xrefStart)
	return buf.Bytes()
}
