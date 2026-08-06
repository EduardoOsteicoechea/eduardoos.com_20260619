package pamphlet

import "fmt"

type SaveLog struct {
	Lines []string `json:"lines"`
}

func NewSaveLog() *SaveLog {
	return &SaveLog{Lines: []string{}}
}

func (l *SaveLog) Line(format string, args ...any) {
	if l == nil {
		return
	}
	l.Lines = append(l.Lines, fmt.Sprintf(format, args...))
}
