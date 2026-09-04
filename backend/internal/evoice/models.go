package evoice

// ObjectMeta is a listed S3 object under docs/ or audios/.
type ObjectMeta struct {
	Name         string `json:"name"`
	Key          string `json:"key"`
	Size         int64  `json:"size"`
	LastModified string `json:"lastModified,omitempty"`
	URL          string `json:"url,omitempty"`
}

// JobStep is one planned generate phase exposed to the UI checklist.
type JobStep struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	State string `json:"state"` // pending | active | done | failed | skipped
}

// JobFileProgress tracks convert status for one source document.
type JobFileProgress struct {
	Name     string `json:"name"`
	State    string `json:"state"` // pending | active | done | skipped | failed
	Progress int    `json:"progress"` // 0–100
	Detail   string `json:"detail,omitempty"`
}

// JobStatus is the async generate job state exposed to the UI.
type JobStatus struct {
	ID          string            `json:"id"`
	State       string            `json:"state"` // queued | running | done | failed | stopped
	Owner       string            `json:"ownerSafe"`
	Project     string            `json:"project"`
	OnlyFiles      []string          `json:"onlyFiles,omitempty"`
	Premium        bool              `json:"premium,omitempty"` // legacy: true when DeepSeek runs
	Mode           string            `json:"mode,omitempty"`    // standard | premium | super_premium
	ContentPercent int               `json:"contentPercent,omitempty"`
	Logs           []string          `json:"logs"`
	Steps       []JobStep         `json:"steps"`
	Files       []JobFileProgress `json:"files"`
	Progress    int               `json:"progress"` // 0–100
	CurrentStep string            `json:"currentStep,omitempty"`
	Error       string            `json:"error,omitempty"`
	Stats       *JobStats         `json:"stats,omitempty"`
}

// JobStats mirrors converter sync_project counters.
type JobStats struct {
	Docs      int `json:"docs"`
	Generated int `json:"generated"`
	Skipped   int `json:"skipped"`
	Failed    int `json:"failed"`
}
