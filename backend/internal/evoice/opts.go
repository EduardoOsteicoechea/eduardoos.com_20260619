package evoice

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Generate modes (spec 069).
const (
	ModeStandard     = "standard"
	ModePremium      = "premium"
	ModeSuperPremium = "super_premium"
)

var allowedContentPercents = map[int]bool{
	100: true, 75: true, 50: true, 25: true, 10: true, 5: true,
}

// GenerateOpts controls convert behavior for one job (spec 069).
type GenerateOpts struct {
	Mode           string
	ContentPercent int
}

// NormalizeMode maps legacy premium bool + mode string to a canonical mode.
func NormalizeMode(mode string, legacyPremium bool) string {
	m := strings.ToLower(strings.TrimSpace(mode))
	switch m {
	case ModeStandard, ModePremium, ModeSuperPremium:
		return m
	case "super", "superpremium", "super-premium":
		return ModeSuperPremium
	}
	if legacyPremium {
		return ModePremium
	}
	return ModeStandard
}

// NormalizeContentPercent clamps to allowed discrete values; default 100.
func NormalizeContentPercent(n int) int {
	if allowedContentPercents[n] {
		return n
	}
	return 100
}

// UsesDeepSeek is true when a text DeepSeek pass runs (format and/or summarize).
func (o GenerateOpts) UsesDeepSeek() bool {
	if o.Mode == ModePremium || o.Mode == ModeSuperPremium {
		return true
	}
	return o.ContentPercent > 0 && o.ContentPercent < 100
}

// IsSuper is true for Vision extract path (PDF/images) + DeepSeek format.
func (o GenerateOpts) IsSuper() bool {
	return o.Mode == ModeSuperPremium
}

// PremiumCompat reports the legacy premium flag (true when DeepSeek chapters run).
func (o GenerateOpts) PremiumCompat() bool {
	return o.UsesDeepSeek()
}

var versionAudioRe = regexp.MustCompile(`(?i)^(.+)\.v(\d+)(?:\.c\d+-.*)?\.mp3$`)

// NextAudioVersion returns max existing vN for stem in audiosDir + 1 (min 1).
func NextAudioVersion(audiosDir, stem string) int {
	max := 0
	entries, err := filepath.Glob(filepath.Join(audiosDir, stem+".v*.mp3"))
	if err != nil {
		return 1
	}
	for _, p := range entries {
		base := filepath.Base(p)
		m := versionAudioRe.FindStringSubmatch(base)
		if m == nil {
			continue
		}
		if m[1] != stem {
			continue
		}
		n, err := strconv.Atoi(m[2])
		if err != nil {
			continue
		}
		if n > max {
			max = n
		}
	}
	return max + 1
}

// ParseAudioVersion returns (stem, version, ok). Legacy names → ok=false.
func ParseAudioVersion(name string) (stem string, version int, ok bool) {
	m := versionAudioRe.FindStringSubmatch(name)
	if m == nil {
		return "", 0, false
	}
	n, err := strconv.Atoi(m[2])
	if err != nil || n < 1 {
		return "", 0, false
	}
	return m[1], n, true
}
