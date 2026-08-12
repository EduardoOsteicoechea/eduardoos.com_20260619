// Package edebat defines the .edebat debate document schema and helpers.
package edebat

import (
	"strings"
	"time"

	"github.com/google/uuid"
)

const SchemaVersion = 1

const AdminEmail = "eduardooost@gmail.com"

// IsAllowedEmail gates the edebat product surface (v1: admin only).
func IsAllowedEmail(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), AdminEmail)
}

// Document is the JSON body stored as {id}.edebat in S3.
type Document struct {
	Version      int           `json:"version"`
	ID           string        `json:"id"`
	Title        string        `json:"title"`
	Topic        string        `json:"topic"`
	RoundsTotal  int           `json:"roundsTotal"`
	Rules        []string      `json:"rules"`
	Participants []Participant `json:"participants"`
	Rounds       []Round       `json:"rounds"`
	Result       *Result       `json:"result,omitempty"`
	CreatedAt    string        `json:"createdAt"`
	UpdatedAt    string        `json:"updatedAt"`
}

type Participant struct {
	Role        string `json:"role"` // challenger | opponent
	Kind        string `json:"kind,omitempty"` // human | llm_expert
	Email       string `json:"email,omitempty"`
	DisplayName string `json:"displayName"`
}

type Round struct {
	Index         int      `json:"index"`
	ChallengerArg string   `json:"challengerArg"`
	OpponentArg   string   `json:"opponentArg"`
	Referee       *Referee `json:"referee,omitempty"`
	CompletedAt   string   `json:"completedAt,omitempty"`
}

type Referee struct {
	ChallengerScore int    `json:"challengerScore"`
	OpponentScore   int    `json:"opponentScore"`
	Analysis        string `json:"analysis"`
}

type Result struct {
	Winner      string `json:"winner"` // challenger | opponent | draw
	Summary     string `json:"summary"`
	FinalScores struct {
		Challenger int `json:"challenger"`
		Opponent   int `json:"opponent"`
	} `json:"finalScores"`
}

// NewEmpty builds a starter debate owned by the given email.
func NewEmpty(email, displayName string) Document {
	now := time.Now().UTC().Format(time.RFC3339)
	id := uuid.NewString()
	return Document{
		Version:     SchemaVersion,
		ID:          id,
		Title:       "Nuevo debate",
		Topic:       "",
		RoundsTotal: 3,
		Rules:       []string{},
		Participants: []Participant{
			{Role: "challenger", Kind: "human", Email: email, DisplayName: displayName},
			{Role: "opponent", Kind: "llm_expert", DisplayName: "Experto"},
		},
		Rounds:    []Round{},
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// Normalize clamps fields and fills defaults before persist.
func Normalize(doc *Document, ownerEmail string) {
	if doc.Version == 0 {
		doc.Version = SchemaVersion
	}
	if strings.TrimSpace(doc.ID) == "" {
		doc.ID = uuid.NewString()
	}
	if doc.RoundsTotal < 1 {
		doc.RoundsTotal = 1
	}
	if doc.RoundsTotal > 20 {
		doc.RoundsTotal = 20
	}
	if doc.Rules == nil {
		doc.Rules = []string{}
	}
	if doc.Rounds == nil {
		doc.Rounds = []Round{}
	}
	if len(doc.Participants) == 0 {
		doc.Participants = []Participant{
			{Role: "challenger", Kind: "human", Email: ownerEmail, DisplayName: ownerEmail},
			{Role: "opponent", Kind: "llm_expert", DisplayName: "Experto"},
		}
	}
	if strings.TrimSpace(doc.Title) == "" {
		topic := strings.TrimSpace(doc.Topic)
		if topic == "" {
			doc.Title = "Debate"
		} else if len(topic) > 48 {
			doc.Title = topic[:48]
		} else {
			doc.Title = topic
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if doc.CreatedAt == "" {
		doc.CreatedAt = now
	}
	doc.UpdatedAt = now
}

// ComputeResult aggregates round scores into a final winner block.
func ComputeResult(doc *Document, summary string) {
	var cTotal, oTotal int
	for _, round := range doc.Rounds {
		if round.Referee == nil {
			continue
		}
		cTotal += round.Referee.ChallengerScore
		oTotal += round.Referee.OpponentScore
	}
	winner := "draw"
	if cTotal > oTotal {
		winner = "challenger"
	} else if oTotal > cTotal {
		winner = "opponent"
	}
	res := &Result{Winner: winner, Summary: strings.TrimSpace(summary)}
	res.FinalScores.Challenger = cTotal
	res.FinalScores.Opponent = oTotal
	doc.Result = res
}
