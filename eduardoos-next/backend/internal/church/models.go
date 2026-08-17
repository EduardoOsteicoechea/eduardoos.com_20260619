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

// DenominationGroup is an admin-managed network / denomination catalog row.
// Register forms pick from this list; denominationId on churches equals Group.ID.
type DenominationGroup struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	CreatedBy string `json:"createdBy,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// Leader is a church leader with one or more ministry role tags.
type Leader struct {
	Name  string   `json:"name"`
	Roles []string `json:"roles"`
}

// Member is a person linked to a church with a church-* role.
// Rich name/contact fields are stored on church.json; dashboard access requires
// a matching eduardoos.com account email + Dynamo membership (no church-management
// subscription needed for members added by an authorized registrar).
// On multi-church register, ChurchID selects which local church card they belong to.
type Member struct {
	Email                 string   `json:"email"`
	FirstName             string   `json:"firstName,omitempty"`
	SecondName            string   `json:"secondName,omitempty"`
	LastName1             string   `json:"lastName1,omitempty"`
	LastName2             string   `json:"lastName2,omitempty"`
	Address               string   `json:"address,omitempty"`
	Phone                 string   `json:"phone,omitempty"`
	Name                  string   `json:"name,omitempty"` // display; derived from parts when empty
	Role                  string   `json:"role"`          // church-admin | church-member
	ChurchID              string   `json:"churchId,omitempty"` // assignment to a registered local church
	AuthorizedActivityIDs []string `json:"authorizedActivityIds,omitempty"`
}

// LocalChurchInput is one iglesia card on multi-church register.
type LocalChurchInput struct {
	ChurchID   string   `json:"churchId,omitempty"`
	Name       string   `json:"name"`
	OpenedAt   string   `json:"openedAt,omitempty"` // YYYY-MM-DD
	Address    string   `json:"address,omitempty"`
	Leadership []string `json:"leadership,omitempty"` // leader names from org líderes catalog
}

// SectorActivity is a named activity bucket by ministry sector.
type SectorActivity struct {
	Sector      string `json:"sector"`
	Description string `json:"description,omitempty"`
}

// ChurchDoc is the durable church.json document.
type ChurchDoc struct {
	DenominationID   string           `json:"denominationId"`
	ChurchID         string           `json:"churchId"`
	Name             string           `json:"name"`
	OpenedAt         string           `json:"openedAt,omitempty"` // YYYY-MM-DD
	Address          string           `json:"address,omitempty"`
	Leaders          []Leader         `json:"leaders,omitempty"`
	OrgLeaders       []Leader         `json:"orgLeaders,omitempty"` // snapshot of church-admin líderes catalog
	Pastors          []string         `json:"pastors,omitempty"`    // legacy; prefer Leaders
	Network          string           `json:"network,omitempty"`
	LocalChurches    []string         `json:"localChurches,omitempty"`
	BeliefsDocument  string           `json:"beliefsDocument,omitempty"`
	SectorActivities []SectorActivity `json:"sectorActivities,omitempty"`
	Members          []Member         `json:"members"`
	OwnerEmail       string           `json:"ownerEmail"`
	S3Prefix         string           `json:"s3Prefix"`
	CreatedAt        string           `json:"createdAt"`
	UpdatedAt        string           `json:"updatedAt"`
}

// Activity is a planned or ongoing church activity.
type Activity struct {
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	Sector           string   `json:"sector,omitempty"`
	Description      string   `json:"description,omitempty"`
	StartDate        string   `json:"startDate,omitempty"` // YYYY-MM-DD
	EndDate          string   `json:"endDate,omitempty"`
	AuthorizedEmails []string `json:"authorizedEmails,omitempty"` // empty → all members
	CreatedBy        string   `json:"createdBy,omitempty"`
	CreatedAt        string   `json:"createdAt"`
	UpdatedAt        string   `json:"updatedAt"`
}

// ActivityReport is a text + image report of what was done.
type ActivityReport struct {
	ID          string   `json:"id"`
	ActivityID  string   `json:"activityId"`
	AuthorEmail string   `json:"authorEmail"`
	Text        string   `json:"text"`
	ImageNames  []string `json:"imageNames,omitempty"`
	CreatedAt   string   `json:"createdAt"`
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
	Memberships []Membership     `json:"memberships"`
	Churches    []OverviewChurch `json:"churches"`
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
