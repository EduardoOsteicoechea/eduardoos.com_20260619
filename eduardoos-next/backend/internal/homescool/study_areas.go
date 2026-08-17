package homescool

import "strings"

// NormalizeStudyAreas builds a clean label list from the preferred studyAreas
// array and the deprecated single studyArea alias.
//
// Migration rule: when studyAreas is empty/missing but studyArea is set
// (legacy DynamoDB / older clients), treat the string as a one-item array.
// Empty strings are dropped; order is preserved; duplicates are removed
// case-insensitively (first occurrence wins).
func NormalizeStudyAreas(areas []string, legacy string) []string {
	out := make([]string, 0, len(areas)+1)
	seen := map[string]struct{}{}
	add := func(raw string) {
		label := strings.TrimSpace(raw)
		if label == "" {
			return
		}
		key := strings.ToLower(label)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, label)
	}
	for _, a := range areas {
		add(a)
	}
	if len(out) == 0 {
		add(legacy)
	}
	return out
}

// FormatStudyAreas joins labels for email / compact display (comma-separated).
func FormatStudyAreas(areas []string) string {
	areas = NormalizeStudyAreas(areas, "")
	if len(areas) == 0 {
		return ""
	}
	return strings.Join(areas, ", ")
}

// HasStudyArea reports whether needle matches any label (case-insensitive).
func HasStudyArea(areas []string, needle string) bool {
	needle = strings.TrimSpace(needle)
	if needle == "" {
		return false
	}
	for _, a := range areas {
		if strings.EqualFold(strings.TrimSpace(a), needle) {
			return true
		}
	}
	return false
}

// ApplyStudyAreasMigration normalizes StudyAreas on a template and syncs the
// deprecated StudyArea field to a comma-joined display string for older readers.
func ApplyStudyAreasMigrationTemplate(tpl *TaskTemplate) {
	if tpl == nil {
		return
	}
	tpl.StudyAreas = NormalizeStudyAreas(tpl.StudyAreas, tpl.StudyArea)
	tpl.StudyArea = FormatStudyAreas(tpl.StudyAreas)
}

// ApplyStudyAreasMigrationTask mirrors ApplyStudyAreasMigrationTemplate for tasks.
func ApplyStudyAreasMigrationTask(task *AssignedTask) {
	if task == nil {
		return
	}
	task.StudyAreas = NormalizeStudyAreas(task.StudyAreas, task.StudyArea)
	task.StudyArea = FormatStudyAreas(task.StudyAreas)
}
