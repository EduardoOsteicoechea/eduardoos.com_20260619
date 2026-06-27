// Package pamphlet implements the spiritual pamphlet layout engine ported from
// document_generator_20260621: JSON → eight-column flow → HTML sheet preview.
package pamphlet

// US Letter landscape dimensions in millimeters.
const (
	PageWidthMM  = 279.4
	PageHeightMM = 215.9

	MarginLateralMM            = 10.0
	MarginVerticalMM           = 10.0
	MidSeparationMM            = 25.0
	ColumnGapMM                  = 4.0
	HeaderFooterGapMM            = 5.0
	IdeaHeadingBottomMarginMM    = 5.0
	ColumnsPerBlock              = 2
	HeaderFraction               = 0.25
	FinalInfoFraction            = 0.25
	DefaultFontSizePt            = 10.0
	DefaultLineHeightFactor      = 1.2
	DefaultParagraphSepFactor    = 1.0
	HeightMeasureCalibration     = 0.95
	TextCharWidthFactor          = 0.55
	CharsPerWord                 = 6.0
	MmToPt                       = 2.83465
	MmToPx                       = 3.7795
)

// EightColumnFlowLabels documents V5 pamphlet column reading order.
var EightColumnFlowLabels = [8]string{
	"S1-Right-Col1", "S1-Right-Col2",
	"S2-Left-Col1", "S2-Left-Col2",
	"S2-Right-Col1", "S2-Right-Col2",
	"S1-Left-Col1", "S1-Left-Col2",
}
