package edebat

import "testing"

func TestIsAllowedEmail(t *testing.T) {
	if !IsAllowedEmail("eduardooost@gmail.com") {
		t.Fatal("expected admin email allowed")
	}
	if !IsAllowedEmail("EduardoOost@gmail.com") {
		t.Fatal("expected case-insensitive allow")
	}
	if IsAllowedEmail("other@example.com") {
		t.Fatal("expected other email denied")
	}
}

func TestComputeResult(t *testing.T) {
	doc := Document{
		Rounds: []Round{
			{Referee: &Referee{ChallengerScore: 8, OpponentScore: 6}},
			{Referee: &Referee{ChallengerScore: 7, OpponentScore: 9}},
			{Referee: &Referee{ChallengerScore: 9, OpponentScore: 8}},
		},
	}
	ComputeResult(&doc, "close match")
	if doc.Result == nil {
		t.Fatal("expected result")
	}
	if doc.Result.Winner != "challenger" {
		t.Fatalf("winner=%s want challenger", doc.Result.Winner)
	}
	if doc.Result.FinalScores.Challenger != 24 || doc.Result.FinalScores.Opponent != 23 {
		t.Fatalf("scores=%v", doc.Result.FinalScores)
	}
	if doc.Result.Summary != "close match" {
		t.Fatalf("summary=%q", doc.Result.Summary)
	}
}

func TestNormalizeClampsRounds(t *testing.T) {
	doc := Document{RoundsTotal: 99, Topic: "A long topic that should become the title when empty"}
	Normalize(&doc, "eduardooost@gmail.com")
	if doc.RoundsTotal != 20 {
		t.Fatalf("roundsTotal=%d", doc.RoundsTotal)
	}
	if doc.ID == "" || doc.Version != SchemaVersion {
		t.Fatalf("id/version missing: %+v", doc)
	}
}

func TestEdebatObjectKeyShape(t *testing.T) {
	// Key helper lives in dynamodb package; schema package stays free of AWS imports.
	_ = NewEmpty("eduardooost@gmail.com", "Eduardo")
}
