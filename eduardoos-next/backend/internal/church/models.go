package church

import "time"

// ChurchCard is the searchable catalog row + list payload.
type ChurchCard struct {
	DenominationID string `json:"denominationId"`
	ChurchID       string `json:"churchId"`
	Name           string `json:"name"`
	Network        string `json:"network,omitempty"`
	S3Prefix       string `json:"s3Prefix"`
	OwnerEmail     string `json:"ownerEmail"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// Member is a person linked to a church with a church-* role.
type Member struct {
	Email                 string   `json:"email"`
	Name                  string   `json:"name,omitempty"`
	Role                  string   `json:"role"` // church-admin | church-member
	AuthorizedActivityIDs []string `json:"authorizedActivityIds,omitempty"`
}

// SectorActivity is a named activity bucket by ministry sector.
type SectorActivity struct {
	Sector      string `json:"sector"`
	Description string `json:"description,omitempty"`
}

// ChurchDoc is the durable church.json document.
type ChurchDoc struct {
	DenominationID  string           `json:"denominationId"`
	ChurchID        string           `json:"churchId"`
	Name            string           `json:"name"`
	Pastors         []string         `json:"pastors"`
	Network         string           `json:"network,omitempty"`
	LocalChurches   []string         `json:"localChurches,omitempty"`
	BeliefsDocument string           `json:"beliefsDocument,omitempty"`
	SectorActivities []SectorActivity `json:"sectorActivities,omitempty"`
	Members         []Member         `json:"members"`
	OwnerEmail      string           `json:"ownerEmail"`
	S3Prefix        string           `json:"s3Prefix"`
	CreatedAt       string           `json:"createdAt"`
	UpdatedAt       string           `json:"updatedAt"`
}

// Activity is a planned or ongoing church activity.
type Activity struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Sector             string   `json:"sector,omitempty"`
	Description        string   `json:"description,omitempty"`
	StartDate          string   `json:"startDate,omitempty"` // YYYY-MM-DD
	EndDate            string   `json:"endDate,omitempty"`
	AuthorizedEmails   []string `json:"authorizedEmails,omitempty"` // empty → all members
	CreatedBy          string   `json:"createdBy,omitempty"`
	CreatedAt          string   `json:"createdAt"`
	UpdatedAt          string   `json:"updatedAt"`
}

// ActivityReport is a text + image report of what was done.
type ActivityReport struct {
	ID           string   `json:"id"`
	ActivityID   string   `json:"activityId"`
	AuthorEmail  string   `json:"authorEmail"`
	Text         string   `json:"text"`
	ImageNames   []string `json:"imageNames,omitempty"`
	CreatedAt    string   `json:"createdAt"`
}

// Membership links a user to a church with a role.
type Membership struct {
	Email          string `json:"email"`
	DenominationID string `json:"denominationId"`
	ChurchID       string `json:"churchId"`
	Role           string `json:"role"`
	ChurchName     string `json:"churchName,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// ChurchDetail is GET detail payload (filtered for members).
type ChurchDetail struct {
	Church     ChurchDoc  `json:"church"`
	Activities []Activity `json:"activities"`
	ViewerRole string     `json:"viewerRole"` // church-admin | church-member | admin
}

// OverviewPayload is GET /api/church/overview.
type OverviewPayload struct {
	Memberships []Membership      `json:"memberships"`
	Churches    []OverviewChurch  `json:"churches"`
}

// OverviewChurch nests a church with activities visible to the viewer.
type OverviewChurch struct {
	Church     ChurchDoc  `json:"church"`
	Activities []Activity `json:"activities"`
	ViewerRole string     `json:"viewerRole"`
}

func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339)
}
