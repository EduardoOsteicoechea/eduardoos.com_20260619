package apikeys

import (
	"encoding/json"
	"testing"
)

func TestBuildDocsCatalog_PayloadSchema068(t *testing.T) {
	cat := BuildDocsCatalog()
	if cat.PayloadSchema.Description == "" {
		t.Fatal("payloadSchema.description required")
	}
	if cat.PayloadSchema.WriteSemantics == "" {
		t.Fatal("payloadSchema.writeSemantics required")
	}
	if cat.PayloadSchema.RootFields["validationCriteria"] == "" {
		t.Fatal("payloadSchema.rootFields.validationCriteria required")
	}
	if cat.PayloadSchema.ItemFields["criteriaStatus"] == "" {
		t.Fatal("payloadSchema.itemFields.criteriaStatus required")
	}
	if cat.PayloadSchema.EffectiveStatus == "" {
		t.Fatal("payloadSchema.effectiveStatus required")
	}
	if cat.AgentGuidance == "" {
		t.Fatal("agentGuidance required")
	}
	raw, err := json.Marshal(cat)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	ps, ok := decoded["payloadSchema"].(map[string]any)
	if !ok || ps == nil {
		t.Fatal("payloadSchema must serialize as object")
	}
	foundPost := false
	for _, r := range cat.Routes {
		if r.Method == "POST" && r.Path == "/api/v1/ereport/orgs/{orgId}/reports/{reportId}" {
			foundPost = true
			if r.Requirements == "" || r.Body == "" {
				t.Fatal("POST route must document body and requirements")
			}
		}
	}
	if !foundPost {
		t.Fatal("POST org report route missing")
	}
}
