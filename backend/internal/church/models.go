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

// LeaderDoc is an independent catalog row (Dynamo + S3 church/leaders/{id}/leader.json).
// Register-gate users (and platform admin) may associate each leader with one or more
// network group ids (from /church/groups) and optionally with churches they can see
// via churchIds as "denominationId/churchId" refs. Networks alone are enough to
// appear in register liderazgo dropdowns before any church exists.
type LeaderDoc struct {
	ID         string   `json:"id"`
	FirstName  string   `json:"firstName"` // nombre
	LastName   string   `json:"lastName"`  // apellido
	Phone      string   `json:"phone,omitempty"`
	Email      string   `json:"email,omitempty"`
	Name       string   `json:"name,omitempty"` // display "nombre apellido"
	Roles      []string `json:"roles"`
	NetworkIDs []string `json:"networkIds,omitempty"` // denomination group ids
	ChurchIDs  []string `json:"churchIds,omitempty"`  // "denomId/churchId" refs
	CreatedBy  string   `json:"createdBy,omitempty"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
}

// Leader is an embedded leadership snapshot on church.json (or legacy inline row).
// Prefer ID from the leaders catalog; firstName/lastName/phone/email/roles are
// denormalized for display. Legacy rows may only have name.
type Leader struct {
	ID        string   `json:"id,omitempty"`        // catalog leader id when known
	FirstName string   `json:"firstName,omitempty"` // nombre
	LastName  string   `json:"lastName,omitempty"`  // apellido
	Phone     string   `json:"phone,omitempty"`
	Email     string   `json:"email,omitempty"`
	Name      string   `json:"name,omitempty"` // display; derived from first+last, or legacy-only
	Roles     []string `json:"roles"`
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
	ChurchID              string   `json:"churchId,omitempty"`
	AuthorizedActivityIDs []string `json:"authorizedActivityIds,omitempty"`
}

// LocalChurchInput is one iglesia card on multi-church register.
type LocalChurchInput struct {
	ChurchID   string   `json:"churchId,omitempty"`
	Name       string   `json:"name"`
	OpenedAt   string   `json:"openedAt,omitempty"` // YYYY-MM-DD
	Address    string   `json:"address,omitempty"`
	Leadership []string `json:"leadership,omitempty"` // catalog leader ids (legacy: display names)
}

// SectorActivity is a named activity bucket by ministry sector.
type SectorActivity struct {
	Sector      string `json:"sector"`
	Description string `json:"description,omitempty"`
}

// Belief is one registered creed item (heading + key passages + full text).
// Slice order in ChurchDoc.Beliefs is the display order (up/down on register).
type Belief struct {
	Heading  string   `json:"heading"`
	KeyTexts []string `json:"keyTexts,omitempty"` // lista de textos claves
	Body     string   `json:"body,omitempty"`     // texto completo de la creencia
}

// ChurchDoc is the durable church.json document.
type ChurchDoc struct {
	DenominationID   string           `json:"denominationId"`
	ChurchID         string           `json:"churchId"`
	Name             string           `json:"name"`
	OpenedAt         string           `json:"openedAt,omitempty"` // YYYY-MM-DD
	Address          string           `json:"address,omitempty"`
	LeaderIDs        []string         `json:"leaderIds,omitempty"`  // catalog ids for this church's leadership
	Leaders          []Leader         `json:"leaders,omitempty"`    // denormalized snapshot (prefer id)
	OrgLeaders       []Leader         `json:"orgLeaders,omitempty"` // legacy register-time inline catalog
	Pastors          []string         `json:"pastors,omitempty"`    // legacy; prefer Leaders
	Network          string           `json:"network,omitempty"`
	LocalChurches    []string         `json:"localChurches,omitempty"`
	Beliefs          []Belief         `json:"beliefs,omitempty"`         // structured creencias list
	BeliefsDocument  string           `json:"beliefsDocument,omitempty"` // legacy single blob
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

// NetworkActivity is a network-scoped activity definition (fan-out to all churches in the denom).
type NetworkActivity struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description,omitempty"`
	DenominationID string `json:"denominationId"`
	CreatedBy      string `json:"createdBy,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
	DeletedAt      string `json:"deletedAt,omitempty"` // soft-delete
}

// NetworkContact is one “persona a contactar” row on an occurrence.
type NetworkContact struct {
	Name     string `json:"name"`
	Address  string `json:"address,omitempty"`
	Phone    string `json:"phone,omitempty"`
	Interest string `json:"interest,omitempty"`
}

// NetworkOccurrence is one church report for a network activity (many per day allowed).
type NetworkOccurrence struct {
	ID                    string           `json:"id"`
	ActivityID            string           `json:"activityId"`
	ChurchID              string           `json:"churchId"`
	DenominationID        string           `json:"denominationId"`
	Date                  string           `json:"date"` // YYYY-MM-DD
	Place                 string           `json:"place,omitempty"`
	ReporterMemberKey     string           `json:"reporterMemberKey"` // email
	ParticipantMemberKeys []string         `json:"participantMemberKeys,omitempty"`
	Description           string           `json:"description,omitempty"`
	Contacts              []NetworkContact `json:"contacts,omitempty"`
	ImageNames            []string         `json:"imageNames,omitempty"`
	CreatedBy             string           `json:"createdBy,omitempty"`
	CreatedAt             string           `json:"createdAt"`
	UpdatedBy             string           `json:"updatedBy,omitempty"`
	UpdatedAt             string           `json:"updatedAt"`
	DeletedAt             string           `json:"deletedAt,omitempty"`
}

// NetworkMemberPoolEntry is one selectable member labeled by church.
type NetworkMemberPoolEntry struct {
	Email      string `json:"email"`
	Name       string `json:"name"`
	ChurchID   string `json:"churchId"`
	ChurchName string `json:"churchName"`
	Role       string `json:"role,omitempty"`
}

// NetworkOccurrenceStats is rollup card summary for one occurrence.
type NetworkOccurrenceStats struct {
	OccurrenceID       string `json:"occurrenceId"`
	Date               string `json:"date"`
	Place              string `json:"place,omitempty"`
	ReporterMemberKey  string `json:"reporterMemberKey,omitempty"`
	ReporterName       string `json:"reporterName,omitempty"`
	ParticipantCount   int    `json:"participantCount"`
	ContactCount       int    `json:"contactCount"`
	ImageCount         int    `json:"imageCount"`
	FirstImageName     string `json:"firstImageName,omitempty"`
}

// NetworkChurchRollup is one church section in the network activity rollup.
type NetworkChurchRollup struct {
	ChurchID   string                   `json:"churchId"`
	ChurchName string                   `json:"churchName"`
	Occurrences []NetworkOccurrenceStats `json:"occurrences"`
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
