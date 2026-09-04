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

// Meta is durable report metadata (tema + shares). OrgID is set for org-based reports (046).
type Meta struct {
	ID           string       `json:"id"`
	Tema         string       `json:"tema"`
	ReportNumber string       `json:"reportNumber,omitempty"`
	ReportDate   string       `json:"reportDate,omitempty"`
	OrgID        string       `json:"orgId,omitempty"`
	OwnerEmail   string       `json:"ownerEmail"`
	OwnerSafe    string       `json:"ownerSafe"`
	SharedWith   []ShareEntry `json:"sharedWith"`
	CreatedAt    string       `json:"createdAt"`
	UpdatedAt    string       `json:"updatedAt"`
}

// OrgCard is one row in the owner's orgs.json index.
type OrgCard struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Order     int    `json:"order"`
	Hidden    bool   `json:"hidden"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// OrgsIndex is ereport/{ownerSafe}/orgs.json.
type OrgsIndex struct {
	Orgs []OrgCard `json:"orgs"`
}

// OrgMeta is durable org metadata under orgs/{orgId}/meta.json.
type OrgMeta struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	OwnerEmail string `json:"ownerEmail"`
	OwnerSafe  string `json:"ownerSafe"`
	Order      int    `json:"order"`
	Hidden     bool   `json:"hidden"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

// RecentReportCard summarizes a report across orgs for the dashboard "Recent reports" strip.
type RecentReportCard struct {
	OrgID        string `json:"orgId"`
	OrgName      string `json:"orgName,omitempty"`
	ID           string `json:"id"`
	Tema         string `json:"tema"`
	ReportNumber string `json:"reportNumber,omitempty"`
	UpdatedAt    string `json:"updatedAt"`
}

// InviteScopeOrg grants access to all reports in an org's library for a duration.
const InviteScopeOrg = "org"

// InviteScopeReport grants access to a single report (1h edit window).
const InviteScopeReport = "report"

// Invite is the durable magic-link grant at ereport/invites/{token}.json.
// Invitees open without Eduardo OS login; CanEdit is always true for 046 grants.
type Invite struct {
	Token     string `json:"token"`
	Scope     string `json:"scope"` // org | report
	OwnerSafe string `json:"ownerSafe"`
	OrgID     string `json:"orgId"`
	ReportID  string `json:"reportId,omitempty"`
	Email     string `json:"email"`
	ExpiresAt string `json:"expiresAt"`
	CreatedAt string `json:"createdAt"`
	CanEdit   bool   `json:"canEdit"`
}

// EmptyPayload returns a minimal portable Issue Tracker document.
func EmptyPayload() map[string]any {
	return map[string]any{
		"reportDate":          "",
		"reportNumber":        "",
		"reportName":          "",
		"orgName":             "",
		"appTitle":            "Issue Tracker",
		"validationCriteria":  []any{},
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
		"criteriaStatus":   map[string]any{},
		"solucion":         "",
		"fechaSolucion":    "",
		"imagesIncidencia": []any{},
		"imagesSolucion":   []any{},
		"images":           []any{},
	}
}
