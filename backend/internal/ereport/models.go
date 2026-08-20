package ereport

// ShareEntry is one collaborator who can open a report.
type ShareEntry struct {
	Email    string `json:"email"`
	UserSafe string `json:"userSafe"`
}

// ReportCard is a lightweight list row.
type ReportCard struct {
	ID           string `json:"id"`
	Tema         string `json:"tema"`
	ReportNumber string `json:"reportNumber,omitempty"`
	UpdatedAt    string `json:"updatedAt"`
}

// Library is the owner's report index.
type Library struct {
	Reports []ReportCard `json:"reports"`
}

// SharedIndex lists reports shared with this user.
type SharedIndex struct {
	Items []SharedItem `json:"items"`
}

// SharedItem points at another owner's report.
type SharedItem struct {
	OwnerSafe string `json:"ownerSafe"`
	OwnerEmail string `json:"ownerEmail,omitempty"`
	ReportID  string `json:"reportId"`
	Tema      string `json:"tema"`
	UpdatedAt string `json:"updatedAt"`
}

// Meta is durable report metadata (tema + shares).
type Meta struct {
	ID           string       `json:"id"`
	Tema         string       `json:"tema"`
	ReportNumber string       `json:"reportNumber,omitempty"`
	ReportDate   string       `json:"reportDate,omitempty"`
	OwnerEmail   string       `json:"ownerEmail"`
	OwnerSafe    string       `json:"ownerSafe"`
	SharedWith   []ShareEntry `json:"sharedWith"`
	CreatedAt    string       `json:"createdAt"`
	UpdatedAt    string       `json:"updatedAt"`
}

// EmptyPayload returns a minimal portable Issue Tracker document.
func EmptyPayload() map[string]any {
	return map[string]any{
		"reportDate":   "",
		"reportNumber": "",
		"appTitle":     "Issue Tracker",
		"sections": []any{
			map[string]any{
				"id":    "section-a",
				"title": "1. Product / platform",
				"kind":  "funcionalidades",
				"groups": []any{
					map[string]any{
						"id":    "group-1",
						"title": "General",
						"items": []any{
							emptyItem("group-1-item-1"),
						},
					},
				},
			},
		},
	}
}

func emptyItem(id string) map[string]any {
	return map[string]any{
		"id":               id,
		"nombre":           "",
		"incidencia":       "",
		"fechaIncidencia":  "",
		"status":           "",
		"solucion":         "",
		"fechaSolucion":    "",
		"imagesIncidencia": []any{},
		"imagesSolucion":   []any{},
		"images":           []any{},
	}
}
