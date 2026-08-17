package homescool

import (
	"fmt"
	"strings"
)

// Teacher-owned catalog kinds used by task template / assign dropdowns.
const (
	CatalogKindPeriod    = "period"
	CatalogKindStudyArea = "study_area"
	CatalogKindTime      = "time"
)

// CatalogEntry is one reusable label (period, study area) or duration preset (time)
// owned by a teacher. Persisted in DynamoDB catalog (or memory) under:
//
//	homescool-cat:t:{teacher}|k:{kind}|id:{id}
type CatalogEntry struct {
	ID           string `json:"id"`
	TeacherEmail string `json:"teacherEmail"`
	Kind         string `json:"kind"`
	Label        string `json:"label"`
	// DurationMin is set for kind=time (minutes). Zero for other kinds.
	DurationMin int    `json:"durationMin,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

// IsValidCatalogKind reports whether kind is period, study_area, or time.
func IsValidCatalogKind(kind string) bool {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case CatalogKindPeriod, CatalogKindStudyArea, CatalogKindTime:
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
		return fmt.Errorf("kind must be period, study_area, or time")
	}
	label := strings.TrimSpace(e.Label)
	if label == "" {
		return fmt.Errorf("label required")
	}
	if kind == CatalogKindTime && e.DurationMin < 1 {
		return fmt.Errorf("durationMin must be at least 1 for time presets")
	}
	return nil
}

func cloneCatalogEntry(e CatalogEntry) CatalogEntry {
	return e
}
