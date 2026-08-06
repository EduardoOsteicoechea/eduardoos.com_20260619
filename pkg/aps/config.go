package aps

import (
	"strings"
	"time"

	"eduardoos/pkg/common"
)

const AdminEmail = "eduardooost@gmail.com"

const DefaultPresignTTL = 3600 * time.Second

type Config struct {
	ClientID        string
	ClientSecret    string
	ActivityID      string
	InputArgName    string
	InputObjectKey  string
	OutputArgName   string
	OutputKeyPrefix string
	OutputFileName  string
	S3Bucket        string
	S3Region        string
	PresignTTL      time.Duration
	TokenURL        string
	WorkItemsURL    string
	OAuthScope      string
}

func LoadConfig() Config {
	ttl := DefaultPresignTTL
	return Config{
		ClientID:        strings.TrimSpace(common.Env("APS_CLIENT_ID", "")),
		ClientSecret:    strings.TrimSpace(common.Env("APS_CLIENT_SECRET", "")),
		ActivityID:      strings.TrimSpace(common.Env("APS_ACTIVITY_ID", "")),
		InputArgName:    strings.TrimSpace(common.Env("APS_INPUT_ARGUMENT", "inputFile")),
		InputObjectKey:  strings.TrimSpace(common.Env("APS_INPUT_OBJECT_KEY", "Snowdon Towers Sample Architectural.rvt")),
		OutputArgName:   strings.TrimSpace(common.Env("APS_OUTPUT_ARGUMENT", "outputFile")),
		OutputKeyPrefix: strings.TrimSpace(common.Env("APS_OUTPUT_KEY_PREFIX", "aps-outputs")),
		OutputFileName:  strings.TrimSpace(common.Env("APS_OUTPUT_FILE_NAME", "result.json")),
		S3Bucket:        strings.TrimSpace(common.Env("APS_S3_BUCKET", "aps20250806")),
		S3Region:        strings.TrimSpace(common.Env("APS_S3_REGION", "us-east-1")),
		PresignTTL:      ttl,
		TokenURL:        strings.TrimSpace(common.Env("APS_TOKEN_URL", "https://developer.api.autodesk.com/authentication/v2/token")),
		WorkItemsURL:    strings.TrimSpace(common.Env("APS_WORKITEMS_URL", "https://developer.api.autodesk.com/da/us-east/v3/workitems")),
		OAuthScope:      strings.TrimSpace(common.Env("APS_OAUTH_SCOPE", "code:all data:read data:write")),
	}
}

func IsAdminEmail(email string) bool {
	return strings.EqualFold(strings.TrimSpace(email), AdminEmail)
}

func (c Config) Validate() error {
	missing := make([]string, 0, 4)
	if c.ClientID == "" {
		missing = append(missing, "APS_CLIENT_ID")
	}
	if c.ClientSecret == "" {
		missing = append(missing, "APS_CLIENT_SECRET")
	}
	if c.ActivityID == "" {
		missing = append(missing, "APS_ACTIVITY_ID")
	}
	if c.S3Bucket == "" {
		missing = append(missing, "APS_S3_BUCKET")
	}
	if len(missing) == 0 {
		return nil
	}
	return &ConfigError{Missing: missing}
}

type ConfigError struct {
	Missing []string
}

func (e *ConfigError) Error() string {
	return "aps config incomplete: missing " + strings.Join(e.Missing, ", ")
}
