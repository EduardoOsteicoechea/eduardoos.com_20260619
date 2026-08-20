package church

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"eduardoos.nex/internal/auth"
)

func TestNetworkActivityCreateOccurrenceAndRollup(t *testing.T) {
	h, r, users := testRouter(t)
	seedUser(t, users, "admin@example.com", auth.RoleAdmin)
	seedUser(t, users, "pastor@example.com", auth.RoleUser)
	seedUser(t, users, "member@example.com", auth.RoleUser)
	grantRegisterAccess(t, h, "pastor@example.com")
	seedDenomGroup(t, h, "asambleas", "Asambleas de Dios")

	payload := map[string]any{
		"denominationId": "asambleas",
		"churches": []map[string]any{
			{"name": "Iglesia Central", "churchId": "central"},
		},
		"members": []map[string]string{
			{"email": "member@example.com", "firstName": "Luis", "role": "church-member", "churchId": "central"},
		},
	}
	body, _ := json.Marshal(payload)
	reg := httptest.NewRequest(http.MethodPost, "/api/church", bytes.NewReader(body))
	reg.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	reg.Header.Set("Content-Type", "application/json")
	rw := httptest.NewRecorder()
	r.ServeHTTP(rw, reg)
	if rw.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", rw.Code, rw.Body.String())
	}

	// Pastor (church-admin) creates network activity.
	naBody, _ := json.Marshal(map[string]string{
		"name": "Evangelismo barrio", "description": "Salidas semanales",
	})
	naReq := httptest.NewRequest(http.MethodPost, "/api/church/groups/asambleas/network-activities", bytes.NewReader(naBody))
	naReq.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	naReq.Header.Set("Content-Type", "application/json")
	naRW := httptest.NewRecorder()
	r.ServeHTTP(naRW, naReq)
	if naRW.Code != http.StatusCreated {
		t.Fatalf("create network activity status=%d body=%s", naRW.Code, naRW.Body.String())
	}
	var created struct {
		Activity NetworkActivity `json:"activity"`
	}
	if err := json.Unmarshal(naRW.Body.Bytes(), &created); err != nil || created.Activity.ID == "" {
		t.Fatalf("parse create: %v body=%s", err, naRW.Body.String())
	}
	actID := created.Activity.ID

	// Member lists church network activities.
	listReq := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/central/network-activities", nil)
	listReq.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	listRW := httptest.NewRecorder()
	r.ServeHTTP(listRW, listReq)
	if listRW.Code != http.StatusOK || !strings.Contains(listRW.Body.String(), "Evangelismo barrio") {
		t.Fatalf("list church net activities status=%d body=%s", listRW.Code, listRW.Body.String())
	}

	// Member creates occurrence.
	occBody, _ := json.Marshal(map[string]any{
		"date":                  "2026-08-20",
		"place":                 "Plaza central",
		"reporterMemberKey":     "member@example.com",
		"participantMemberKeys": []string{"member@example.com", "pastor@example.com"},
		"description":           "Buen clima",
		"contacts": []map[string]string{
			{"name": "Pedro", "phone": "555", "interest": "visita"},
		},
	})
	occReq := httptest.NewRequest(http.MethodPost,
		"/api/church/asambleas/central/network-activities/"+actID+"/occurrences",
		bytes.NewReader(occBody))
	occReq.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	occReq.Header.Set("Content-Type", "application/json")
	occRW := httptest.NewRecorder()
	r.ServeHTTP(occRW, occReq)
	if occRW.Code != http.StatusCreated {
		t.Fatalf("create occurrence status=%d body=%s", occRW.Code, occRW.Body.String())
	}

	// Second occurrence same day allowed.
	occ2Body, _ := json.Marshal(map[string]any{
		"date": "2026-08-20", "place": "Sector norte", "reporterMemberKey": "pastor@example.com",
	})
	occ2Req := httptest.NewRequest(http.MethodPost,
		"/api/church/asambleas/central/network-activities/"+actID+"/occurrences",
		bytes.NewReader(occ2Body))
	occ2Req.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	occ2Req.Header.Set("Content-Type", "application/json")
	occ2RW := httptest.NewRecorder()
	r.ServeHTTP(occ2RW, occ2Req)
	if occ2RW.Code != http.StatusCreated {
		t.Fatalf("second occurrence status=%d body=%s", occ2RW.Code, occ2RW.Body.String())
	}

	// Rollup shows stats.
	rollReq := httptest.NewRequest(http.MethodGet,
		"/api/church/groups/asambleas/network-activities/"+actID+"/rollup", nil)
	rollReq.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	rollRW := httptest.NewRecorder()
	r.ServeHTTP(rollRW, rollReq)
	if rollRW.Code != http.StatusOK {
		t.Fatalf("rollup status=%d body=%s", rollRW.Code, rollRW.Body.String())
	}
	if !strings.Contains(rollRW.Body.String(), "Plaza central") ||
		!strings.Contains(rollRW.Body.String(), `"participantCount":2`) {
		t.Fatalf("rollup missing stats: %s", rollRW.Body.String())
	}

	// Soft-delete activity hides from list.
	delReq := httptest.NewRequest(http.MethodDelete,
		"/api/church/groups/asambleas/network-activities/"+actID, nil)
	delReq.Header.Set("Authorization", "Bearer "+bearer(t, "pastor@example.com", auth.RoleUser))
	delRW := httptest.NewRecorder()
	r.ServeHTTP(delRW, delReq)
	if delRW.Code != http.StatusOK {
		t.Fatalf("soft-delete status=%d body=%s", delRW.Code, delRW.Body.String())
	}
	list2 := httptest.NewRequest(http.MethodGet, "/api/church/asambleas/central/network-activities", nil)
	list2.Header.Set("Authorization", "Bearer "+bearer(t, "member@example.com", auth.RoleUser))
	list2RW := httptest.NewRecorder()
	r.ServeHTTP(list2RW, list2)
	if strings.Contains(list2RW.Body.String(), "Evangelismo barrio") {
		t.Fatalf("soft-deleted activity still listed: %s", list2RW.Body.String())
	}
}
