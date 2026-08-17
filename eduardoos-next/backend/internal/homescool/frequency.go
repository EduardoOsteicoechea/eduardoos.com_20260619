package homescool

import (
	"fmt"
	"strings"
	"time"
)

// Task frequency kinds for assigned work within a start/end date window.
const (
	// FrequencyOnce — appear on the start date only (one-shot / specific day).
	FrequencyOnce = "once"
	// FrequencyDaily — every calendar day from startDate through endDate inclusive.
	FrequencyDaily = "daily"
	// FrequencyDailyExcept — daily, skipping weekday numbers in ExcludeWeekdays.
	// Weekday numbers follow Go's time.Weekday: 0=Sunday … 6=Saturday.
	FrequencyDailyExcept = "daily_except"
)

// TaskFrequency describes how an assigned task appears on the calendar and
// how pending boards should interpret the assignment window.
//
// Persistence model (single AssignedTask row):
//   - One board card per assignment (submit/grade once for the whole window).
//   - Calendar expands occurrence dates from StartDate..EndDate + Frequency.
//   - Missing/empty Frequency defaults to FrequencyOnce (legacy tasks).
//
// Recurrence rules:
//   - once: occurrences = { StartDate } (EndDate is still the due/conclusion).
//   - daily: every day in [StartDate, EndDate].
//   - daily_except: same as daily, omitting ExcludeWeekdays (0=Sun … 6=Sat).
type TaskFrequency struct {
	Kind            string `json:"kind"`
	ExcludeWeekdays []int  `json:"excludeWeekdays,omitempty"`
}

// NormalizeFrequency cleans kind / exclude lists and applies legacy defaults.
func NormalizeFrequency(f *TaskFrequency) TaskFrequency {
	if f == nil {
		return TaskFrequency{Kind: FrequencyOnce}
	}
	kind := strings.ToLower(strings.TrimSpace(f.Kind))
	switch kind {
	case FrequencyOnce, FrequencyDaily, FrequencyDailyExcept:
		// ok
	case "":
		kind = FrequencyOnce
	default:
		kind = FrequencyOnce
	}
	out := TaskFrequency{Kind: kind}
	if kind == FrequencyDailyExcept {
		seen := map[int]struct{}{}
		for _, d := range f.ExcludeWeekdays {
			if d < 0 || d > 6 {
				continue
			}
			if _, ok := seen[d]; ok {
				continue
			}
			seen[d] = struct{}{}
			out.ExcludeWeekdays = append(out.ExcludeWeekdays, d)
		}
	}
	return out
}

// ValidateFrequency reports whether the frequency payload is acceptable.
func ValidateFrequency(f TaskFrequency) error {
	n := NormalizeFrequency(&f)
	switch n.Kind {
	case FrequencyOnce, FrequencyDaily, FrequencyDailyExcept:
		return nil
	default:
		return fmt.Errorf("frequency.kind must be once, daily, or daily_except")
	}
}

// FormatFrequencyLabel is a short English label for cards/emails.
func FormatFrequencyLabel(f TaskFrequency) string {
	n := NormalizeFrequency(&f)
	switch n.Kind {
	case FrequencyDaily:
		return "Daily"
	case FrequencyDailyExcept:
		if len(n.ExcludeWeekdays) == 0 {
			return "Daily"
		}
		names := make([]string, 0, len(n.ExcludeWeekdays))
		for _, d := range n.ExcludeWeekdays {
			names = append(names, time.Weekday(d).String()[:3])
		}
		return "Daily except " + strings.Join(names, ", ")
	default:
		return "Specific day"
	}
}

// ExpandOccurrenceDates returns YYYY-MM-DD dates in [start, end] that match f.
// Invalid or inverted ranges yield an empty slice. Caps at 400 days to avoid
// runaway expansion from bad input.
func ExpandOccurrenceDates(startDate, endDate string, f TaskFrequency) ([]string, error) {
	n := NormalizeFrequency(&f)
	start, err := parseDateOnly(startDate)
	if err != nil {
		return nil, fmt.Errorf("invalid startDate")
	}
	end := start
	if strings.TrimSpace(endDate) != "" {
		end, err = parseDateOnly(endDate)
		if err != nil {
			return nil, fmt.Errorf("invalid endDate")
		}
	}
	if end.Before(start) {
		return nil, fmt.Errorf("endDate must be on or after startDate")
	}

	if n.Kind == FrequencyOnce {
		return []string{start.Format("2006-01-02")}, nil
	}

	exclude := map[int]struct{}{}
	if n.Kind == FrequencyDailyExcept {
		for _, d := range n.ExcludeWeekdays {
			exclude[d] = struct{}{}
		}
	}

	out := make([]string, 0)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		if len(out) >= 400 {
			break
		}
		if _, skip := exclude[int(d.Weekday())]; skip {
			continue
		}
		out = append(out, d.Format("2006-01-02"))
	}
	return out, nil
}

func parseDateOnly(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	return time.ParseInLocation("2006-01-02", s, time.UTC)
}
