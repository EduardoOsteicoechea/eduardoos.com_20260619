package content

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"
	"time"

	"eduardoos.nex/internal/awsx"
	"eduardoos.nex/internal/httpx"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

// FooterFields is the pamphlet page-footer chrome (action, message, 4×2 meta).
// Same keys as the .epam document footer object so apply/overlay is a map copy.
type FooterFields struct {
	Action  string `json:"action"`
	Message string `json:"message"`
	Label1  string `json:"label1"`
	Value1  string `json:"value1"`
	Label2  string `json:"label2"`
	Value2  string `json:"value2"`
	Label3  string `json:"label3"`
	Value3  string `json:"value3"`
	Label4  string `json:"label4"`
	Value4  string `json:"value4"`
}

// FooterProfile is a named, reusable static footer owned by one user.
type FooterProfile struct {
	UserID    string       `json:"userId"`
	FooterID  string       `json:"footerId"`
	Name      string       `json:"name"`
	Footer    FooterFields `json:"footer"`
	CreatedAt string       `json:"createdAt,omitempty"`
	UpdatedAt string       `json:"updatedAt,omitempty"`
}

// FooterStore persists static footer profiles keyed by userId + footerId.
type FooterStore interface {
	Save(ctx context.Context, rec FooterProfile, correlationID string) (FooterProfile, error)
	Get(ctx context.Context, userID, footerID, correlationID string) (FooterProfile, bool, error)
	ListByUser(ctx context.Context, userID, correlationID string) ([]FooterProfile, error)
	Delete(ctx context.Context, userID, footerID, correlationID string) error
}

const (
	// DefaultFooterLabel1 is the first meta caption when the user leaves it blank.
	DefaultFooterLabel1 = "WhatsApp:"
	// DefaultFooterLabel2 is the second meta caption.
	DefaultFooterLabel2 = "Teléfono:"
	// DefaultFooterLabel3 is the third meta caption.
	DefaultFooterLabel3 = "Dirección:"
	// DefaultFooterLabel4 is the fourth meta caption.
	DefaultFooterLabel4 = "Actividades:"
	// FooterBindLinked means GET overlays the current master profile into the document.
	FooterBindLinked = "linked"
	// FooterBindSnapshot means the pamphlet keeps a frozen copy of the footer fields.
	FooterBindSnapshot = "snapshot"
)

func defaultFooterFields() FooterFields {
	return FooterFields{
		Label1: DefaultFooterLabel1,
		Label2: DefaultFooterLabel2,
		Label3: DefaultFooterLabel3,
		Label4: DefaultFooterLabel4,
	}
}

func ensureFooterLabelColon(label string) string {
	t := strings.TrimSpace(label)
	if t == "" || strings.HasSuffix(t, ":") {
		return t
	}
	return t + ":"
}

func normalizeFooterFields(f FooterFields) FooterFields {
	if strings.TrimSpace(f.Label1) == "" {
		f.Label1 = DefaultFooterLabel1
	} else {
		f.Label1 = ensureFooterLabelColon(f.Label1)
	}
	if strings.TrimSpace(f.Label2) == "" {
		f.Label2 = DefaultFooterLabel2
	} else {
		f.Label2 = ensureFooterLabelColon(f.Label2)
	}
	if strings.TrimSpace(f.Label3) == "" {
		f.Label3 = DefaultFooterLabel3
	} else {
		f.Label3 = ensureFooterLabelColon(f.Label3)
	}
	if strings.TrimSpace(f.Label4) == "" {
		f.Label4 = DefaultFooterLabel4
	} else {
		f.Label4 = ensureFooterLabelColon(f.Label4)
	}
	return f
}

func (f FooterFields) asMap() map[string]any {
	return map[string]any{
		"action":  f.Action,
		"message": f.Message,
		"label1":  f.Label1,
		"value1":  f.Value1,
		"label2":  f.Label2,
		"value2":  f.Value2,
		"label3":  f.Label3,
		"value3":  f.Value3,
		"label4":  f.Label4,
		"value4":  f.Value4,
	}
}

func footerFieldsFromAny(raw any) FooterFields {
	base := defaultFooterFields()
	m, ok := raw.(map[string]any)
	if !ok {
		return base
	}
	pick := func(key string) string {
		return stringFromAny(m[key])
	}
	base.Action = pick("action")
	base.Message = pick("message")
	if v := pick("label1"); v != "" {
		base.Label1 = v
	}
	base.Value1 = pick("value1")
	if v := pick("label2"); v != "" {
		base.Label2 = v
	}
	base.Value2 = pick("value2")
	if v := pick("label3"); v != "" {
		base.Label3 = v
	}
	base.Value3 = pick("value3")
	if v := pick("label4"); v != "" {
		base.Label4 = v
	}
	base.Value4 = pick("value4")
	return normalizeFooterFields(base)
}

type memoryFooterStore struct {
	mu     sync.RWMutex
	byUser map[string]map[string]FooterProfile
}

// NewMemoryFooterStore is the test/dev backend for static footers.
func NewMemoryFooterStore() FooterStore {
	return &memoryFooterStore{byUser: map[string]map[string]FooterProfile{}}
}

func (m *memoryFooterStore) Save(_ context.Context, rec FooterProfile, _ string) (FooterProfile, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if rec.FooterID == "" {
		rec.FooterID = uuid.NewString()
	}
	if rec.CreatedAt == "" {
		rec.CreatedAt = now
	}
	rec.UpdatedAt = now
	rec.Footer = normalizeFooterFields(rec.Footer)
	m.mu.Lock()
	if m.byUser[rec.UserID] == nil {
		m.byUser[rec.UserID] = map[string]FooterProfile{}
	}
	m.byUser[rec.UserID][rec.FooterID] = rec
	m.mu.Unlock()
	return rec, nil
}

func (m *memoryFooterStore) Get(_ context.Context, userID, footerID, _ string) (FooterProfile, bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return FooterProfile{}, false, nil
	}
	rec, ok := bucket[footerID]
	return rec, ok, nil
}

func (m *memoryFooterStore) ListByUser(_ context.Context, userID, _ string) ([]FooterProfile, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.byUser[userID]
	out := make([]FooterProfile, 0, len(bucket))
	for _, rec := range bucket {
		out = append(out, rec)
	}
	return out, nil
}

func (m *memoryFooterStore) Delete(_ context.Context, userID, footerID, _ string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	bucket := m.byUser[userID]
	if bucket == nil {
		return nil
	}
	delete(bucket, footerID)
	return nil
}

type dynamoFooterStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoFooterStore) Save(ctx context.Context, rec FooterProfile, _ string) (FooterProfile, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if rec.FooterID == "" {
		rec.FooterID = uuid.NewString()
	}
	if rec.CreatedAt == "" {
		rec.CreatedAt = now
	}
	rec.UpdatedAt = now
	rec.Footer = normalizeFooterFields(rec.Footer)
	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      footerItem(rec),
	})
	return rec, err
}

func (d *dynamoFooterStore) Get(ctx context.Context, userID, footerID, _ string) (FooterProfile, bool, error) {
	out, err := d.client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId":   &types.AttributeValueMemberS{Value: userID},
			"footerId": &types.AttributeValueMemberS{Value: footerID},
		},
	})
	if err != nil {
		return FooterProfile{}, false, err
	}
	if out.Item == nil {
		return FooterProfile{}, false, nil
	}
	rec, ok := footerFromItem(out.Item)
	return rec, ok, nil
}

func (d *dynamoFooterStore) ListByUser(ctx context.Context, userID, _ string) ([]FooterProfile, error) {
	out, err := d.client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(d.table),
		KeyConditionExpression: aws.String("userId = :uid"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":uid": &types.AttributeValueMemberS{Value: userID},
		},
	})
	if err != nil {
		return nil, err
	}
	records := make([]FooterProfile, 0, len(out.Items))
	for _, row := range out.Items {
		if rec, ok := footerFromItem(row); ok {
			records = append(records, rec)
		}
	}
	return records, nil
}

func (d *dynamoFooterStore) Delete(ctx context.Context, userID, footerID, _ string) error {
	_, err := d.client.DeleteItem(ctx, &dynamodb.DeleteItemInput{
		TableName: aws.String(d.table),
		Key: map[string]types.AttributeValue{
			"userId":   &types.AttributeValueMemberS{Value: userID},
			"footerId": &types.AttributeValueMemberS{Value: footerID},
		},
	})
	return err
}

func footerItem(r FooterProfile) map[string]types.AttributeValue {
	return map[string]types.AttributeValue{
		"userId":    &types.AttributeValueMemberS{Value: r.UserID},
		"footerId":  &types.AttributeValueMemberS{Value: r.FooterID},
		"name":      &types.AttributeValueMemberS{Value: r.Name},
		"action":    &types.AttributeValueMemberS{Value: r.Footer.Action},
		"message":   &types.AttributeValueMemberS{Value: r.Footer.Message},
		"label1":    &types.AttributeValueMemberS{Value: r.Footer.Label1},
		"value1":    &types.AttributeValueMemberS{Value: r.Footer.Value1},
		"label2":    &types.AttributeValueMemberS{Value: r.Footer.Label2},
		"value2":    &types.AttributeValueMemberS{Value: r.Footer.Value2},
		"label3":    &types.AttributeValueMemberS{Value: r.Footer.Label3},
		"value3":    &types.AttributeValueMemberS{Value: r.Footer.Value3},
		"label4":    &types.AttributeValueMemberS{Value: r.Footer.Label4},
		"value4":    &types.AttributeValueMemberS{Value: r.Footer.Value4},
		"createdAt": &types.AttributeValueMemberS{Value: r.CreatedAt},
		"updatedAt": &types.AttributeValueMemberS{Value: r.UpdatedAt},
	}
}

func footerFromItem(item map[string]types.AttributeValue) (FooterProfile, bool) {
	r := FooterProfile{Footer: defaultFooterFields()}
	s := func(key string) string {
		if v, ok := item[key].(*types.AttributeValueMemberS); ok {
			return v.Value
		}
		return ""
	}
	r.UserID = s("userId")
	r.FooterID = s("footerId")
	r.Name = s("name")
	r.Footer.Action = s("action")
	r.Footer.Message = s("message")
	r.Footer.Label1 = s("label1")
	r.Footer.Value1 = s("value1")
	r.Footer.Label2 = s("label2")
	r.Footer.Value2 = s("value2")
	r.Footer.Label3 = s("label3")
	r.Footer.Value3 = s("value3")
	r.Footer.Label4 = s("label4")
	r.Footer.Value4 = s("value4")
	r.CreatedAt = s("createdAt")
	r.UpdatedAt = s("updatedAt")
	r.Footer = normalizeFooterFields(r.Footer)
	return r, r.UserID != "" && r.FooterID != ""
}

// OpenFooterStore selects memory or DynamoDB. Production reuses EPAMS_BACKEND
// so pamphlets and their static footers land on the same AWS account without a
// second feature flag.
//
// Table default is eduardoos_pamphlet_footer_profiles (userId + footerId).
// Do not point FOOTERS_TABLE at legacy eduardoos_pamphlet_footers — that table
// uses sort key pamphletId and will reject PutItem without pamphletId.
func OpenFooterStore(ctx context.Context) FooterStore {
	mode := strings.ToLower(strings.TrimSpace(httpx.Env("FOOTERS_BACKEND", "")))
	if mode == "" {
		mode = strings.ToLower(strings.TrimSpace(httpx.Env("EPAMS_BACKEND", "memory")))
	}
	if mode != "dynamodb" {
		log.Printf("pamphlet footers store backend=memory")
		return NewMemoryFooterStore()
	}
	cfg, err := awsx.LoadConfig(ctx)
	if err != nil {
		log.Printf("pamphlet footers FOOTERS_BACKEND=dynamodb but AWS unavailable (%v); falling back to memory", err)
		return NewMemoryFooterStore()
	}
	table := httpx.Env("FOOTERS_TABLE", "eduardoos_pamphlet_footer_profiles")
	log.Printf("pamphlet footers store backend=dynamodb table=%s", table)
	return &dynamoFooterStore{client: dynamodb.NewFromConfig(cfg), table: table}
}

func cloneBodyMap(src map[string]any) (map[string]any, error) {
	if src == nil {
		return map[string]any{}, nil
	}
	raw, err := json.Marshal(src)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// overlay helpers live next to the store so Get/Copy/articles share one path.

func applyLinkedFooter(ctx context.Context, rec *EpamRecord, store FooterStore, correlationID string) {
	if rec == nil || rec.Body == nil || store == nil {
		return
	}
	bind := strings.TrimSpace(stringFromAny(rec.Body["footer_bind"]))
	if bind != FooterBindLinked {
		return
	}
	pid := strings.TrimSpace(stringFromAny(rec.Body["footer_profile_id"]))
	if pid == "" {
		return
	}
	profile, ok, err := store.Get(ctx, rec.UserID, pid, correlationID)
	if err != nil {
		log.Printf("[correlation=%s] epams.footer overlay failed epamId=%s footerId=%s err=%v", correlationID, rec.EpamID, pid, err)
		return
	}
	if !ok {
		log.Printf("[correlation=%s] epams.footer overlay missing profile epamId=%s footerId=%s", correlationID, rec.EpamID, pid)
		return
	}
	cloned, err := cloneBodyMap(rec.Body)
	if err != nil {
		return
	}
	cloned["footer"] = profile.Footer.asMap()
	rec.Body = cloned
}

func titlesFromEpams(records []EpamRecord) []string {
	out := make([]string, 0, len(records))
	for _, rec := range records {
		t := strings.TrimSpace(rec.Title)
		if t == "" {
			t = strings.TrimSpace(rec.FileName)
		}
		if t == "" {
			t = rec.EpamID
		}
		out = append(out, t)
	}
	return out
}

func sanitizeEpamFileName(title string) string {
	s := strings.TrimSpace(title)
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, "\\", "_")
	if s == "" {
		s = "pamphlet"
	}
	if !strings.HasSuffix(strings.ToLower(s), ".epam") {
		s += ".epam"
	}
	return s
}

func setHeaderTitle(body map[string]any, title string) {
	header, _ := body["header"].(map[string]any)
	if header == nil {
		header = map[string]any{}
		body["header"] = header
	}
	header["title"] = title
}
