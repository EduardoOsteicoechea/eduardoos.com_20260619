package homescool

import (
	"fmt"
	"strings"
)

// Teacher-owned catalog kinds used by task template / assign dropdowns.
// Duration is NOT a catalog — templates use fixed presets (see frontend HOMESCOOL_DURATION_PRESETS).
const (
	CatalogKindPeriod    = "period"
	CatalogKindStudyArea = "study_area"
)

// CatalogEntry is one reusable label (period or study area) owned by a teacher.
// Persisted in DynamoDB catalog (or memory) under:
//
//	homescool-cat:t:{teacher}|k:{kind}|id:{id}
type CatalogEntry struct {
	ID           string `json:"id"`
	TeacherEmail string `json:"teacherEmail"`
	Kind         string `json:"kind"`
	Label        string `json:"label"`
	CreatedAt    string `json:"createdAt"`
}

// IsValidCatalogKind reports whether kind is period or study_area.
func IsValidCatalogKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case CatalogKindPeriod, CatalogKindStudyArea:
		return true
	default:
		return false
	}
}

// NormalizeCatalogKind lowercases and trims a catalog kind string.
func NormalizeCatalogKind(kind string) string {
	return strings.ToLower(strings.TrimSpace(kind))
}

// ValidateCatalogEntry checks required fields before persistence.
func ValidateCatalogEntry(e CatalogEntry) error {
	kind := NormalizeCatalogKind(e.Kind)
	if !IsValidCatalogKind(kind) {
		return fmt.Errorf("kind must be period or study_area")
	}
	label := strings.TrimSpace(e.Label)
	if label == "" {
		return fmt.Errorf("label required")
	}
	return nil
}

func cloneCatalogEntry(e CatalogEntry) CatalogEntry {
	return e
}
