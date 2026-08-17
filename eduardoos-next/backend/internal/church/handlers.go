package church

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const maxImageBytes = 5 << 20 // 5 MiB

// Handler serves JWT-gated Church APIs.
type Handler struct {
	JWTSecret      string
	Users          auth.UserStore
	Catalog        CatalogStore
	Groups         GroupStore
	Leaders        LeaderStore
	Memberships    MembershipStore
	Authorizations AuthorizationStore
	Entitlements   *payments.Store
	Objects        ObjectSpace
	Mail           Mailer
	auth           *auth.Handler
}

// NewHandler wires in-memory defaults; production replaces stores/objects.
func NewHandler(jwtSecret string, users auth.UserStore) *Handler {
	return &Handler{
		JWTSecret:      jwtSecret,
		Users:          users,
		Catalog:        NewMemoryCatalog(),
		Groups:         NewMemoryGroups(),
		Leaders:        NewMemoryLeaders(),
		Memberships:    NewMemoryMemberships(),
		Authorizations: NewMemoryAuthorizations(),
		Objects:        NewMemoryObjectSpace(),
		auth:           &auth.Handler{JWTSecret: jwtSecret, Store: users},
	}
}

// Routes mounts /api/church/* behind RequireJWT.
func (h *Handler) Routes(r chi.Router) {
	r.Group(func(pr chi.Router) {
		pr.Use(h.auth.RequireJWT)

		pr.Get("/api/church", h.ListChurches)
		pr.Post("/api/church", h.RegisterChurch)
		pr.Get("/api/church/overview", h.Overview)
		pr.Get("/api/church/activity", h.MyActivities)
		pr.Get("/api/church/authorization", h.GetAuthorization)
		pr.Post("/api/church/authorization/request", h.RequestAuthorization)

		// Groups catalog — list for any JWT; mutate platform-admin only.
		// Mounted before /{denomID}/{churchID} so "groups" is not a denom slug.
		pr.Get("/api/church/groups", h.ListGroups)
		pr.Post("/api/church/groups", h.CreateGroup)
		pr.Put("/api/church/groups/{groupID}", h.UpdateGroup)
		pr.Delete("/api/church/groups/{groupID}", h.DeleteGroup)
		pr.Get("/api/church/leader-roles", h.ListLeaderRoles)

		// Leaders catalog — list for any JWT; mutate register-gate / platform admin.
		pr.Get("/api/church/leaders", h.ListLeaders)
		pr.Post("/api/church/leaders", h.CreateLeader)
		pr.Put("/api/church/leaders/{leaderID}", h.UpdateLeader)
		pr.Delete("/api/church/leaders/{leaderID}", h.DeleteLeader)

		pr.Get("/api/church/{denomID}/{churchID}", h.GetChurch)
		pr.Put("/api/church/{denomID}/{churchID}", h.UpdateChurch)
		pr.Post("/api/church/{denomID}/{churchID}/members", h.UpsertMember)
		pr.Post("/api/church/{denomID}/{churchID}/activities", h.CreateActivity)
		pr.Post("/api/church/{denomID}/{churchID}/activities/{activityID}/report", h.PostReport)
		pr.Get("/api/church/{denomID}/{churchID}/activities/{activityID}/images/{name}", h.GetImage)
	})
}

func (h *Handler) ListChurches(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	q := r.URL.Query().Get("q")
	items, err := h.Catalog.List(r.Context(), q)
	if err != nil {
		log.Printf("[correlation=%s] church.list error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not list churches")
		return
	}
	if items == nil {
		items = []ChurchCard{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"churches": items})
}

func (h *Handler) RegisterChurch(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	owner := auth.UserEmailFromRequest(r)
	if h.Catalog == nil || h.Objects == nil || h.Memberships == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "church storage not configured")
		return
	}
	if allowed, reason := h.canRegisterChurches(r.Context(), owner); !allowed {
		httpx.WriteError(w, http.StatusForbidden, reason)
		return
	}
	var body struct {
		Name             string             `json:"name"`
		DenominationID   string             `json:"denominationId"`
		ChurchID         string             `json:"churchId"`
		OpenedAt         string             `json:"openedAt"`
		Address          string             `json:"address"`
		Pastors          []string           `json:"pastors"`
		Leaders          []Leader           `json:"leaders"` // legacy inline; upserted into catalog
		Network          string             `json:"network"`
		LocalChurches    []string           `json:"localChurches"`
		Churches         []LocalChurchInput `json:"churches"`
		Beliefs          []Belief           `json:"beliefs"`
		BeliefsDocument  string             `json:"beliefsDocument"`
		SectorActivities []SectorActivity   `json:"sectorActivities"`
		Members          []Member           `json:"members"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	denom := SanitizeSlug(body.DenominationID)
	if denom == "" {
		denom = SanitizeSlug(body.Network)
	}
	if !IsValidSlug(denom) {
		httpx.WriteError(w, http.StatusBadRequest, "denominationId required from groups catalog")
		return
	}

	networkName := strings.TrimSpace(body.Network)
	if h.Groups != nil {
		group, ok, gerr := h.Groups.Get(r.Context(), denom)
		if gerr != nil {
			log.Printf("[correlation=%s] church.register group_lookup: %v", cid, gerr)
			httpx.WriteError(w, http.StatusBadGateway, "could not verify denomination group")
			return
		}
		if !ok {
			httpx.WriteError(w, http.StatusBadRequest, "denominationId must exist in /church/groups catalog")
			return
		}
		if networkName == "" {
			networkName = group.Name
		}
	}

	if err := validateLeaderContacts(body.Leaders); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Load leaders catalog; migrate any legacy inline líderes into it.
	var catalogDocs []LeaderDoc
	if h.Leaders != nil {
		var lerr error
		catalogDocs, lerr = h.Leaders.List(r.Context())
		if lerr != nil {
			log.Printf("[correlation=%s] church.register leaders_list: %v", cid, lerr)
			httpx.WriteError(w, http.StatusBadGateway, "could not list leaders catalog")
			return
		}
	}
	orgLeaders := normalizeLeaders(body.Leaders)
	if len(orgLeaders) == 0 && len(body.Pastors) > 0 {
		orgLeaders = leadersFromPastors(body.Pastors)
	}
	if len(orgLeaders) > 0 {
		migrated, _, merr := h.upsertInlineLeadersIntoCatalog(r, cid, owner, orgLeaders)
		if merr != nil {
			log.Printf("[correlation=%s] church.register leaders_migrate: %v", cid, merr)
			httpx.WriteError(w, http.StatusBadGateway, "could not migrate inline leaders")
			return
		}
		orgLeaders = migrated
		if h.Leaders != nil {
			catalogDocs, _ = h.Leaders.List(r.Context())
		}
	}

	beliefs, beliefsSummary := resolveBeliefsForWrite(body.Beliefs, body.BeliefsDocument)

	// Prefer multi church cards; fall back to single legacy name/churchId row.
	churchInputs := body.Churches
	if len(churchInputs) == 0 {
		name := strings.TrimSpace(body.Name)
		churchID := SanitizeSlug(body.ChurchID)
		if churchID == "" {
			churchID = SanitizeSlug(name)
		}
		if name == "" || !IsValidSlug(churchID) {
			httpx.WriteError(w, http.StatusBadRequest, "at least one church card (name) is required")
			return
		}
		leadership := make([]string, 0, len(orgLeaders))
		for _, L := range orgLeaders {
			if L.ID != "" {
				leadership = append(leadership, L.ID)
			} else {
				leadership = append(leadership, leaderDisplayName(L))
			}
		}
		churchInputs = []LocalChurchInput{{
			ChurchID:   churchID,
			Name:       name,
			OpenedAt:   strings.TrimSpace(body.OpenedAt),
			Address:    strings.TrimSpace(body.Address),
			Leadership: leadership,
		}}
	}

	now := nowRFC3339()
	allMembers := body.Members
	createdCards := make([]ChurchCard, 0, len(churchInputs))
	createdDocs := make([]ChurchDoc, 0, len(churchInputs))
	localNames := make([]string, 0, len(churchInputs))
	validChurchIDs := map[string]string{} // id → name

	for _, in := range churchInputs {
		name := strings.TrimSpace(in.Name)
		churchID := SanitizeSlug(in.ChurchID)
		if churchID == "" {
			churchID = SanitizeSlug(name)
		}
		if name == "" || !IsValidSlug(churchID) {
			httpx.WriteError(w, http.StatusBadRequest, "each church card needs a valid name")
			return
		}
		if _, dup := validChurchIDs[churchID]; dup {
			httpx.WriteError(w, http.StatusBadRequest, "duplicate churchId in churches list: "+churchID)
			return
		}
		validChurchIDs[churchID] = name
		localNames = append(localNames, name)

		leaders, leaderIDs := pickLeadershipFromRefs(catalogDocs, in.Leadership, orgLeaders)

		// Members assigned to this church (or unassigned when only one church).
		assigned := make([]Member, 0)
		for _, m := range allMembers {
			assignID := SanitizeSlug(m.ChurchID)
			if assignID == churchID || (assignID == "" && len(churchInputs) == 1) {
				cp := m
				cp.ChurchID = churchID
				assigned = append(assigned, cp)
			}
		}
		members := normalizeMembers(assigned, owner)

		doc := ChurchDoc{
			DenominationID:   denom,
			ChurchID:         churchID,
			Name:             name,
			OpenedAt:         strings.TrimSpace(in.OpenedAt),
			Address:          strings.TrimSpace(in.Address),
			LeaderIDs:        leaderIDs,
			Leaders:          leaders,
			OrgLeaders:       orgLeaders,
			Network:          networkName,
			LocalChurches:    nil, // filled after loop
			Beliefs:          beliefs,
			BeliefsDocument:  beliefsSummary,
			SectorActivities: body.SectorActivities,
			Members:          members,
			OwnerEmail:       owner,
			S3Prefix:         ChurchPrefix(denom, churchID),
			CreatedAt:        now,
			UpdatedAt:        now,
		}
		card := ChurchCard{
			DenominationID: denom,
			ChurchID:       churchID,
			Name:           name,
			Network:        networkName,
			S3Prefix:       doc.S3Prefix,
			OwnerEmail:     owner,
			CreatedAt:      now,
			UpdatedAt:      now,
		}
		created, err := h.Catalog.Create(r.Context(), card)
		if errors.Is(err, ErrDuplicate) {
			// Roll back prior creates in this request.
			for _, prev := range createdCards {
				_ = h.Catalog.Delete(r.Context(), prev.DenominationID, prev.ChurchID)
				_ = h.Objects.DeleteKey(r.Context(), ChurchMetaKey(prev.DenominationID, prev.ChurchID), cid)
			}
			httpx.WriteError(w, http.StatusConflict, "church already exists: "+churchID)
			return
		}
		if err != nil {
			log.Printf("[correlation=%s] church.register catalog_error: %v", cid, err)
			httpx.WriteError(w, http.StatusBadGateway, fmt.Sprintf("could not register church: %v", err))
			return
		}
		createdCards = append(createdCards, created)
		createdDocs = append(createdDocs, doc)
	}

	// Persist docs with sibling local church names for network tab.
	for i := range createdDocs {
		createdDocs[i].LocalChurches = localNames
		doc := createdDocs[i]
		if err := h.Objects.PutJSON(r.Context(), ChurchMetaKey(doc.DenominationID, doc.ChurchID), doc, cid); err != nil {
			log.Printf("[correlation=%s] church.register s3_error key=%s: %v", cid, ChurchMetaKey(doc.DenominationID, doc.ChurchID), err)
			for _, prev := range createdCards {
				_ = h.Catalog.Delete(r.Context(), prev.DenominationID, prev.ChurchID)
				_ = h.Objects.DeleteKey(r.Context(), ChurchMetaKey(prev.DenominationID, prev.ChurchID), cid)
			}
			httpx.WriteError(w, http.StatusBadGateway, fmt.Sprintf(
				"could not persist church.json under church/ (S3/IAM): %v", err))
			return
		}
		for _, m := range doc.Members {
			_, _ = h.Memberships.Upsert(r.Context(), Membership{
				Email:          m.Email,
				DenominationID: denom,
				ChurchID:       doc.ChurchID,
				Role:           m.Role,
				ChurchName:     doc.Name,
				CreatedAt:      now,
				UpdatedAt:      now,
			})
		}
		// Link catalog leaders → this new church (even if they only had networkIds).
		h.appendLeadersChurchRef(r, cid, ChurchRef(doc.DenominationID, doc.ChurchID), doc.LeaderIDs)
	}

	log.Printf("[correlation=%s] church.register owner=%s denom=%s count=%d", cid, owner, denom, len(createdCards))
	first := createdCards[0]
	firstDoc := createdDocs[0]
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"church":    first,
		"document":  firstDoc,
		"churches":  createdCards,
		"documents": createdDocs,
	})
}

func (h *Handler) GetChurch(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	if !IsValidSlug(denom) || !IsValidSlug(churchID) {
		httpx.WriteError(w, http.StatusBadRequest, "invalid ids")
		return
	}
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil {
		log.Printf("[correlation=%s] church.get access_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not resolve access")
		return
	}
	if !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "not a member of this church")
		return
	}
	doc, ok, err := h.loadChurchDoc(r.Context(), denom, churchID, cid)
	if err != nil {
		log.Printf("[correlation=%s] church.get error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load church")
		return
	}
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "church not found")
		return
	}
	acts, err := h.listActivities(r.Context(), denom, churchID, cid)
	if err != nil {
		log.Printf("[correlation=%s] church.get activities_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load activities")
		return
	}
	detail := ChurchDetail{
		Church:     filterChurchForViewer(va, doc),
		Activities: filterActivities(va, doc, acts),
		ViewerRole: va.Role,
	}
	detail.Church.Leaders = ensureLeaders(detail.Church)
	detail.Church.Beliefs = ensureBeliefs(detail.Church)
	httpx.WriteJSON(w, http.StatusOK, detail)
}

func (h *Handler) UpdateChurch(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK || !va.IsAdmin {
		httpx.WriteError(w, http.StatusForbidden, "church-admin required")
		return
	}
	doc, ok, err := h.loadChurchDoc(r.Context(), denom, churchID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "church not found")
		return
	}
	var body ChurchDoc
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	doc.Name = strings.TrimSpace(body.Name)
	if doc.Name == "" {
		httpx.WriteError(w, http.StatusBadRequest, "name required")
		return
	}
	doc.OpenedAt = strings.TrimSpace(body.OpenedAt)
	doc.Address = strings.TrimSpace(body.Address)
	if body.Leaders != nil {
		if err := validateLeaderContacts(body.Leaders); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		doc.Leaders = normalizeLeaders(body.Leaders)
	} else if body.Pastors != nil {
		doc.Leaders = leadersFromPastors(body.Pastors)
		doc.Pastors = cleanStringList(body.Pastors)
	}
	if body.OrgLeaders != nil {
		if err := validateLeaderContacts(body.OrgLeaders); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		doc.OrgLeaders = normalizeLeaders(body.OrgLeaders)
	}
	doc.Network = strings.TrimSpace(body.Network)
	doc.LocalChurches = cleanStringList(body.LocalChurches)
	if body.Beliefs != nil || strings.TrimSpace(body.BeliefsDocument) != "" {
		beliefs, summary := resolveBeliefsForWrite(body.Beliefs, body.BeliefsDocument)
		doc.Beliefs = beliefs
		doc.BeliefsDocument = summary
	}
	if body.LeaderIDs != nil {
		doc.LeaderIDs = cleanStringList(body.LeaderIDs)
	}
	doc.SectorActivities = body.SectorActivities
	if body.Members != nil {
		doc.Members = normalizeMembers(body.Members, doc.OwnerEmail)
		for _, m := range doc.Members {
			_, _ = h.Memberships.Upsert(r.Context(), Membership{
				Email:          m.Email,
				DenominationID: denom,
				ChurchID:       churchID,
				Role:           m.Role,
				ChurchName:     doc.Name,
				CreatedAt:      doc.UpdatedAt,
				UpdatedAt:      doc.UpdatedAt,
			})
		}
	}
	doc.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), ChurchMetaKey(denom, churchID), doc, cid); err != nil {
		log.Printf("[correlation=%s] church.update s3_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not update church")
		return
	}
	if card, ok, _ := h.Catalog.Get(r.Context(), denom, churchID); ok {
		card.Name = doc.Name
		card.Network = doc.Network
		card.UpdatedAt = doc.UpdatedAt
		_, _ = h.Catalog.Update(r.Context(), card)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"church": doc})
}

func (h *Handler) UpsertMember(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK || !va.IsAdmin {
		httpx.WriteError(w, http.StatusForbidden, "church-admin required")
		return
	}
	var body Member
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	body.Email = auth.NormalizeEmail(body.Email)
	body.Role = NormalizeChurchRole(body.Role)
	body.FirstName = strings.TrimSpace(body.FirstName)
	body.SecondName = strings.TrimSpace(body.SecondName)
	body.LastName1 = strings.TrimSpace(body.LastName1)
	body.LastName2 = strings.TrimSpace(body.LastName2)
	body.Address = strings.TrimSpace(body.Address)
	body.Phone = strings.TrimSpace(body.Phone)
	body.ChurchID = SanitizeSlug(body.ChurchID)
	if body.ChurchID == "" {
		body.ChurchID = churchID
	}
	body.Name = memberDisplayName(body)
	if body.Email == "" {
		httpx.WriteError(w, http.StatusBadRequest, "email required")
		return
	}
	doc, ok, err := h.loadChurchDoc(r.Context(), denom, churchID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "church not found")
		return
	}
	found := false
	for i, m := range doc.Members {
		if auth.NormalizeEmail(m.Email) == body.Email {
			doc.Members[i] = body
			found = true
			break
		}
	}
	if !found {
		doc.Members = append(doc.Members, body)
	}
	doc.UpdatedAt = nowRFC3339()
	if err := h.Objects.PutJSON(r.Context(), ChurchMetaKey(denom, churchID), doc, cid); err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "could not save member")
		return
	}
	now := nowRFC3339()
	mem, err := h.Memberships.Upsert(r.Context(), Membership{
		Email:          body.Email,
		DenominationID: denom,
		ChurchID:       churchID,
		Role:           body.Role,
		ChurchName:     doc.Name,
		CreatedAt:      now,
		UpdatedAt:      now,
	})
	if err != nil {
		log.Printf("[correlation=%s] church.member upsert_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not upsert membership")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"member": body, "membership": mem})
}

func (h *Handler) CreateActivity(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK || !va.IsAdmin {
		httpx.WriteError(w, http.StatusForbidden, "church-admin required")
		return
	}
	var body struct {
		Title            string   `json:"title"`
		Sector           string   `json:"sector"`
		Description      string   `json:"description"`
		StartDate        string   `json:"startDate"`
		EndDate          string   `json:"endDate"`
		AuthorizedEmails []string `json:"authorizedEmails"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		httpx.WriteError(w, http.StatusBadRequest, "title required")
		return
	}
	now := nowRFC3339()
	id := uuid.NewString()
	act := Activity{
		ID:               id,
		Title:            title,
		Sector:           strings.TrimSpace(body.Sector),
		Description:      strings.TrimSpace(body.Description),
		StartDate:        strings.TrimSpace(body.StartDate),
		EndDate:          strings.TrimSpace(body.EndDate),
		AuthorizedEmails: cleanStringList(body.AuthorizedEmails),
		CreatedBy:        email,
		CreatedAt:        now,
		UpdatedAt:        now,
	}
	if err := h.Objects.PutJSON(r.Context(), ActivityMetaKey(denom, churchID, id), act, cid); err != nil {
		log.Printf("[correlation=%s] church.activity.create error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not create activity")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"activity": act})
}

func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	ov, err := h.buildOverview(r.Context(), email, cid)
	if err != nil {
		log.Printf("[correlation=%s] church.overview error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load overview")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, ov)
}

func (h *Handler) MyActivities(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	ov, err := h.buildOverview(r.Context(), email, cid)
	if err != nil {
		log.Printf("[correlation=%s] church.activity overview_error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load activities")
		return
	}
	type row struct {
		DenominationID string           `json:"denominationId"`
		ChurchID       string           `json:"churchId"`
		ChurchName     string           `json:"churchName"`
		Activity       Activity         `json:"activity"`
		Reports        []ActivityReport `json:"reports"`
		ViewerRole     string           `json:"viewerRole"`
	}
	rows := make([]row, 0)
	for _, ch := range ov.Churches {
		for _, act := range ch.Activities {
			reports, _ := h.listReports(r.Context(), ch.Church.DenominationID, ch.Church.ChurchID, act.ID, cid)
			rows = append(rows, row{
				DenominationID: ch.Church.DenominationID,
				ChurchID:       ch.Church.ChurchID,
				ChurchName:     ch.Church.Name,
				Activity:       act,
				Reports:        reports,
				ViewerRole:     ch.ViewerRole,
			})
		}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"activities": rows})
}

func (h *Handler) PostReport(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "membership required")
		return
	}
	doc, ok, err := h.loadChurchDoc(r.Context(), denom, churchID, cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "church not found")
		return
	}
	var act Activity
	found, err := h.Objects.GetJSON(r.Context(), ActivityMetaKey(denom, churchID, activityID), &act, cid)
	if err != nil || !found {
		httpx.WriteError(w, http.StatusNotFound, "activity not found")
		return
	}
	if !canSeeActivity(va, doc, act) {
		httpx.WriteError(w, http.StatusForbidden, "not authorized for this activity")
		return
	}

	ct := r.Header.Get("Content-Type")
	var text string
	imageNames := make([]string, 0)
	if strings.HasPrefix(ct, "multipart/form-data") {
		if err := r.ParseMultipartForm(maxImageBytes * 4); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid multipart")
			return
		}
		text = strings.TrimSpace(r.FormValue("text"))
		files := r.MultipartForm.File["images"]
		for _, fh := range files {
			f, err := fh.Open()
			if err != nil {
				continue
			}
			body, err := io.ReadAll(io.LimitReader(f, maxImageBytes+1))
			_ = f.Close()
			if err != nil || len(body) > maxImageBytes {
				httpx.WriteError(w, http.StatusBadRequest, "image too large")
				return
			}
			safe := SanitizeSlug(strings.TrimSuffix(fh.Filename, path.Ext(fh.Filename)))
			if safe == "" {
				safe = "img"
			}
			ext := strings.ToLower(path.Ext(fh.Filename))
			if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" && ext != ".gif" {
				ext = ".jpg"
			}
			name := fmt.Sprintf("%s-%s%s", safe, uuid.NewString()[:8], ext)
			mime := fh.Header.Get("Content-Type")
			if mime == "" {
				mime = "image/jpeg"
			}
			if err := h.Objects.PutBytes(r.Context(), ImageKey(denom, churchID, activityID, name), body, mime, cid); err != nil {
				log.Printf("[correlation=%s] church.report.image error: %v", cid, err)
				httpx.WriteError(w, http.StatusBadGateway, "could not store image")
				return
			}
			imageNames = append(imageNames, name)
		}
	} else {
		var body struct {
			Text string `json:"text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
			return
		}
		text = strings.TrimSpace(body.Text)
	}
	if text == "" && len(imageNames) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "text or images required")
		return
	}
	now := nowRFC3339()
	rep := ActivityReport{
		ID:          uuid.NewString(),
		ActivityID:  activityID,
		AuthorEmail: email,
		Text:        text,
		ImageNames:  imageNames,
		CreatedAt:   now,
	}
	if err := h.Objects.PutJSON(r.Context(), ReportKey(denom, churchID, activityID, rep.ID), rep, cid); err != nil {
		log.Printf("[correlation=%s] church.report error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not save report")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"report": rep})
}

func (h *Handler) GetImage(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	denom := chi.URLParam(r, "denomID")
	churchID := chi.URLParam(r, "churchID")
	activityID := chi.URLParam(r, "activityID")
	name := path.Base(chi.URLParam(r, "name"))
	va, err := h.resolveAccess(r.Context(), email, denom, churchID)
	if err != nil || !va.OK {
		httpx.WriteError(w, http.StatusForbidden, "membership required")
		return
	}
	body, ct, ok, err := h.Objects.GetBytes(r.Context(), ImageKey(denom, churchID, activityID, name), cid)
	if err != nil || !ok {
		httpx.WriteError(w, http.StatusNotFound, "image not found")
		return
	}
	w.Header().Set("Content-Type", ct)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (h *Handler) buildOverview(ctx context.Context, email, cid string) (OverviewPayload, error) {
	role := auth.RoleUser
	if h.Users != nil {
		if u, ok, err := h.Users.GetUser(ctx, email); err == nil && ok {
			role = u.Role
		}
	}
	var memberships []Membership
	var err error
	if auth.IsAdmin(email, role) {
		cards, listErr := h.Catalog.List(ctx, "")
		if listErr != nil {
			return OverviewPayload{}, listErr
		}
		memberships = make([]Membership, 0, len(cards))
		for _, c := range cards {
			memberships = append(memberships, Membership{
				Email:          email,
				DenominationID: c.DenominationID,
				ChurchID:       c.ChurchID,
				Role:           "admin",
				ChurchName:     c.Name,
			})
		}
	} else {
		memberships, err = h.Memberships.ListByUser(ctx, email)
		if err != nil {
			return OverviewPayload{}, err
		}
	}
	if memberships == nil {
		memberships = []Membership{}
	}
	churches := make([]OverviewChurch, 0, len(memberships))
	for _, mem := range memberships {
		va, aerr := h.resolveAccess(ctx, email, mem.DenominationID, mem.ChurchID)
		if aerr != nil || !va.OK {
			continue
		}
		doc, ok, lerr := h.loadChurchDoc(ctx, mem.DenominationID, mem.ChurchID, cid)
		if lerr != nil || !ok {
			continue
		}
		acts, _ := h.listActivities(ctx, mem.DenominationID, mem.ChurchID, cid)
		doc.Leaders = ensureLeaders(doc)
		doc.Beliefs = ensureBeliefs(doc)
		churches = append(churches, OverviewChurch{
			Church:     filterChurchForViewer(va, doc),
			Activities: filterActivities(va, doc, acts),
			ViewerRole: va.Role,
		})
	}
	return OverviewPayload{Memberships: memberships, Churches: churches}, nil
}

func (h *Handler) loadChurchDoc(ctx context.Context, denom, churchID, cid string) (ChurchDoc, bool, error) {
	var doc ChurchDoc
	ok, err := h.Objects.GetJSON(ctx, ChurchMetaKey(denom, churchID), &doc, cid)
	return doc, ok, err
}

func (h *Handler) listActivities(ctx context.Context, denom, churchID, cid string) ([]Activity, error) {
	prefix := ChurchPrefix(denom, churchID) + "/activities/"
	keys, err := h.Objects.ListKeys(ctx, prefix, cid)
	if err != nil {
		return nil, err
	}
	out := make([]Activity, 0)
	seen := map[string]bool{}
	for _, key := range keys {
		if !strings.HasSuffix(key, "/activity.json") {
			continue
		}
		id := parseActivityIDFromKey(key)
		if id == "" || seen[id] {
			continue
		}
		var act Activity
		ok, err := h.Objects.GetJSON(ctx, key, &act, cid)
		if err != nil || !ok {
			continue
		}
		seen[id] = true
		out = append(out, act)
	}
	return out, nil
}

func (h *Handler) listReports(ctx context.Context, denom, churchID, activityID, cid string) ([]ActivityReport, error) {
	prefix := ActivityPrefix(denom, churchID, activityID) + "/reports/"
	keys, err := h.Objects.ListKeys(ctx, prefix, cid)
	if err != nil {
		return nil, err
	}
	out := make([]ActivityReport, 0)
	for _, key := range keys {
		if !strings.HasSuffix(key, ".json") {
			continue
		}
		var rep ActivityReport
		ok, err := h.Objects.GetJSON(ctx, key, &rep, cid)
		if err != nil || !ok {
			continue
		}
		out = append(out, rep)
	}
	return out, nil
}

func cleanStringList(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func normalizeMembers(in []Member, ownerEmail string) []Member {
	ownerEmail = auth.NormalizeEmail(ownerEmail)
	out := make([]Member, 0, len(in)+1)
	seen := map[string]bool{}
	for _, m := range in {
		email := auth.NormalizeEmail(m.Email)
		if email == "" || seen[email] {
			continue
		}
		seen[email] = true
		role := NormalizeChurchRole(m.Role)
		if email == ownerEmail {
			role = RoleChurchAdmin
		}
		display := memberDisplayName(m)
		out = append(out, Member{
			Email:                 email,
			FirstName:             strings.TrimSpace(m.FirstName),
			SecondName:            strings.TrimSpace(m.SecondName),
			LastName1:             strings.TrimSpace(m.LastName1),
			LastName2:             strings.TrimSpace(m.LastName2),
			Address:               strings.TrimSpace(m.Address),
			Phone:                 strings.TrimSpace(m.Phone),
			Name:                  display,
			Role:                  role,
			ChurchID:              SanitizeSlug(m.ChurchID),
			AuthorizedActivityIDs: m.AuthorizedActivityIDs,
		})
	}
	if !seen[ownerEmail] {
		out = append([]Member{{
			Email: ownerEmail,
			Role:  RoleChurchAdmin,
		}}, out...)
	}
	return out
}

// GetAuthorization returns the caller's church-management authorization status
// plus whether they may register (approved + entitlement, or platform admin).
func (h *Handler) GetAuthorization(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	isAdmin := h.isPlatformAdmin(r.Context(), email)
	status, req, err := h.authorizationStatus(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] church.authorization get error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load authorization")
		return
	}
	hasEnt := isAdmin || h.hasChurchManagementEntitlement(email)
	canReg, reason := h.canRegisterChurches(r.Context(), email)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"email":                   email,
		"isPlatformAdmin":         isAdmin,
		"authorizationStatus":     status,
		"hasChurchManagement":     hasEnt,
		"canRegister":             canReg,
		"gateReason":              reason,
		"requestedAt":             req.RequestedAt,
		"decidedAt":               req.DecidedAt,
		"subscribePath":           "/payments/subscription",
		"serviceId":               "church-management",
	})
}

// RequestAuthorization creates or renews a pending platform-admin approval request.
// Rejected users may request again; approved/pending users are idempotent.
func (h *Handler) RequestAuthorization(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	email := auth.UserEmailFromRequest(r)
	if h.isPlatformAdmin(r.Context(), email) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"email":               email,
			"authorizationStatus": AuthStatusApproved,
			"isPlatformAdmin":     true,
			"message":             "platform admin does not need authorization",
		})
		return
	}
	if h.Authorizations == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "authorization store not configured")
		return
	}
	existing, ok, err := h.Authorizations.Get(r.Context(), email)
	if err != nil {
		log.Printf("[correlation=%s] church.authorization request get error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not load authorization")
		return
	}
	if ok {
		switch NormalizeAuthStatus(existing.Status) {
		case AuthStatusPending:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"email":               email,
				"authorizationStatus": AuthStatusPending,
				"requestedAt":         existing.RequestedAt,
				"message":             "request already pending",
			})
			return
		case AuthStatusApproved:
			httpx.WriteJSON(w, http.StatusOK, map[string]any{
				"email":               email,
				"authorizationStatus": AuthStatusApproved,
				"requestedAt":         existing.RequestedAt,
				"decidedAt":           existing.DecidedAt,
				"message":             "already approved; subscribe to church-management to register",
			})
			return
		}
	}
	now := nowAuthRFC3339()
	req := AuthorizationRequest{
		Email:       email,
		Status:      AuthStatusPending,
		RequestedAt: now,
	}
	saved, err := h.Authorizations.Put(r.Context(), req)
	if err != nil {
		log.Printf("[correlation=%s] church.authorization request put error: %v", cid, err)
		httpx.WriteError(w, http.StatusBadGateway, "could not save authorization request")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{
		"email":               saved.Email,
		"authorizationStatus": saved.Status,
		"requestedAt":         saved.RequestedAt,
		"message":             "authorization requested; wait for platform admin approval",
	})
}
