// Package dynamodb — playlist persistence (in-memory locally, AWS DynamoDB on EC2).
package dynamodb

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"eduardoos/pkg/common"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"
)

// Playlist is the domain model stored in DynamoDB eduardoos_playlists.
type Playlist struct {
	UserID            string   `json:"userId" dynamodbav:"userId"`
	PlaylistID        string   `json:"playlistId" dynamodbav:"playlistId"`
	Name              string   `json:"name" dynamodbav:"name"`
	TrackIDs          []string `json:"trackIds" dynamodbav:"trackIds"`
	CreatedAt         string   `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt         string   `json:"updatedAt" dynamodbav:"updatedAt"`
	LastCorrelationID string   `json:"lastCorrelationId,omitempty" dynamodbav:"lastCorrelationId,omitempty"`
}

// PlaylistStore persists worship playlists per authenticated user.
type PlaylistStore interface {
	SavePlaylist(ctx context.Context, playlist Playlist, correlationID string) (Playlist, error)
	GetPlaylistsByUserID(ctx context.Context, userID, correlationID string) ([]Playlist, error)
	BackendName() string
}

type memoryPlaylistStore struct {
	mu        sync.RWMutex
	playlists map[string]map[string]Playlist
}

func newMemoryPlaylistStore() *memoryPlaylistStore {
	return &memoryPlaylistStore{playlists: map[string]map[string]Playlist{}}
}

func (m *memoryPlaylistStore) BackendName() string { return "memory" }

func (m *memoryPlaylistStore) SavePlaylist(_ context.Context, playlist Playlist, correlationID string) (Playlist, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if playlist.PlaylistID == "" {
		playlist.PlaylistID = uuid.NewString()
	}
	if playlist.CreatedAt == "" {
		playlist.CreatedAt = now
	}
	playlist.UpdatedAt = now
	playlist.LastCorrelationID = correlationID

	m.mu.Lock()
	if m.playlists[playlist.UserID] == nil {
		m.playlists[playlist.UserID] = map[string]Playlist{}
	}
	m.playlists[playlist.UserID][playlist.PlaylistID] = playlist
	m.mu.Unlock()
	return playlist, nil
}

func (m *memoryPlaylistStore) GetPlaylistsByUserID(_ context.Context, userID, _ string) ([]Playlist, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	bucket := m.playlists[userID]
	out := make([]Playlist, 0, len(bucket))
	for _, p := range bucket {
		out = append(out, p)
	}
	return out, nil
}

type dynamoPlaylistStore struct {
	client *dynamodb.Client
	table  string
}

func (d *dynamoPlaylistStore) BackendName() string { return "dynamodb" }

func (d *dynamoPlaylistStore) SavePlaylist(ctx context.Context, playlist Playlist, correlationID string) (Playlist, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	if playlist.PlaylistID == "" {
		playlist.PlaylistID = uuid.NewString()
	}
	if playlist.CreatedAt == "" {
		playlist.CreatedAt = now
	}
	playlist.UpdatedAt = now
	playlist.LastCorrelationID = correlationID

	_, err := d.client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(d.table),
		Item:      playlistItem(playlist),
	})
	if err != nil {
		return Playlist{}, err
	}
	log.Printf("[correlation=%s] dynamodb SavePlaylist user=%s playlist=%s", correlationID, playlist.UserID, playlist.PlaylistID)
	return playlist, nil
}

func (d *dynamoPlaylistStore) GetPlaylistsByUserID(ctx context.Context, userID, correlationID string) ([]Playlist, error) {
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
	playlists := make([]Playlist, 0, len(out.Items))
	for _, row := range out.Items {
		if p, ok := playlistFromItem(row); ok {
			playlists = append(playlists, p)
		}
	}
	log.Printf("[correlation=%s] dynamodb GetPlaylistsByUserID user=%s count=%d", correlationID, userID, len(playlists))
	return playlists, nil
}

// NewPlaylistStore selects memory or DynamoDB implementation from environment.
func NewPlaylistStore(ctx context.Context) (PlaylistStore, error) {
	mode := common.Env("PLAYLISTS_BACKEND", "memory")
	table := common.Env("PLAYLISTS_TABLE", "eduardoos_playlists")
	if mode != "dynamodb" {
		return newMemoryPlaylistStore(), nil
	}
	region := common.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &dynamoPlaylistStore{
		client: dynamodb.NewFromConfig(cfg),
		table:  table,
	}, nil
}

func playlistItem(p Playlist) map[string]types.AttributeValue {
	trackValues := make([]types.AttributeValue, 0, len(p.TrackIDs))
	for _, id := range p.TrackIDs {
		trackValues = append(trackValues, &types.AttributeValueMemberS{Value: id})
	}
	item := map[string]types.AttributeValue{
		"userId":     &types.AttributeValueMemberS{Value: p.UserID},
		"playlistId": &types.AttributeValueMemberS{Value: p.PlaylistID},
		"name":       &types.AttributeValueMemberS{Value: p.Name},
		"trackIds":   &types.AttributeValueMemberL{Value: trackValues},
		"createdAt":  &types.AttributeValueMemberS{Value: p.CreatedAt},
		"updatedAt":  &types.AttributeValueMemberS{Value: p.UpdatedAt},
	}
	if p.LastCorrelationID != "" {
		item["lastCorrelationId"] = &types.AttributeValueMemberS{Value: p.LastCorrelationID}
	}
	return item
}

func playlistFromItem(item map[string]types.AttributeValue) (Playlist, bool) {
	p := Playlist{}
	if v, ok := item["userId"].(*types.AttributeValueMemberS); ok {
		p.UserID = v.Value
	}
	if v, ok := item["playlistId"].(*types.AttributeValueMemberS); ok {
		p.PlaylistID = v.Value
	}
	if v, ok := item["name"].(*types.AttributeValueMemberS); ok {
		p.Name = v.Value
	}
	if v, ok := item["createdAt"].(*types.AttributeValueMemberS); ok {
		p.CreatedAt = v.Value
	}
	if v, ok := item["updatedAt"].(*types.AttributeValueMemberS); ok {
		p.UpdatedAt = v.Value
	}
	if v, ok := item["lastCorrelationId"].(*types.AttributeValueMemberS); ok {
		p.LastCorrelationID = v.Value
	}
	if v, ok := item["trackIds"].(*types.AttributeValueMemberL); ok {
		for _, av := range v.Value {
			if s, ok := av.(*types.AttributeValueMemberS); ok {
				p.TrackIDs = append(p.TrackIDs, s.Value)
			}
		}
	}
	return p, p.UserID != "" && p.PlaylistID != ""
}
