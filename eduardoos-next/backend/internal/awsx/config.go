package awsx

import (
	"context"
	"fmt"

	"eduardoos.nex/internal/httpx"

	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/aws"
)

// LoadConfig loads the default AWS SDK config for the configured region.
// It also retrieves credentials once so missing local creds fail early
// with a clear error instead of cryptic DynamoDB 403s later.
func LoadConfig(ctx context.Context) (aws.Config, error) {
	region := httpx.Env("AWS_REGION", "us-east-1")
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(region))
	if err != nil {
		return aws.Config{}, fmt.Errorf("aws config load failed (region=%s): %w", region, err)
	}
	if _, err := cfg.Credentials.Retrieve(ctx); err != nil {
		return aws.Config{}, fmt.Errorf("aws credentials missing or unusable (set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or an instance role): %w", err)
	}
	return cfg, nil
}
