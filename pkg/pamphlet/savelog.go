package pamphlet

import "fmt"

// SaveLog collects human-readable save pipeline lines for API responses.
type SaveLog struct {
	Lines []string `json:"lines"`
}

// NewSaveLog starts an empty pamphlet save trace.
func NewSaveLog() *SaveLog {
	return &SaveLog{Lines: []string{}}
}

// Line appends one formatted log entry.
func (l *SaveLog) Line(format string, args ...any) {
	if l == nil {
		return
	}
	l.Lines = append(l.Lines, fmt.Sprintf(format, args...))
}
