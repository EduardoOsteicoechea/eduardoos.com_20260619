package s3store

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type awsStore struct {
	bucket string
	prefix string
	client *s3.Client
}

func newAWSStore(ctx context.Context, cfg Config) (*awsStore, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(cfg.Region))
	if err != nil {
		return nil, fmt.Errorf("aws config: %w", err)
	}
	return &awsStore{
		bucket: cfg.Bucket,
		prefix: cfg.Prefix,
		client: s3.NewFromConfig(awsCfg),
	}, nil
}

func (a *awsStore) BackendName() string { return "aws" }
func (a *awsStore) BucketName() string  { return a.bucket }

func (a *awsStore) PutAbsolute(ctx context.Context, objectKey, contentType string, data []byte) (UploadResult, error) {
	if err := ValidateAbsoluteKey(objectKey); err != nil {
		return UploadResult{}, err
	}
	ct := contentType
	_, err := a.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(a.bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: &ct,
	})
	if err != nil {
		return UploadResult{}, err
	}
	return UploadResult{
		Bucket: a.bucket, Key: objectKey, ContentType: contentType, Stored: true,
	}, nil
}

func (a *awsStore) GetAbsolute(ctx context.Context, objectKey string) ([]byte, string, error) {
	if err := ValidateAbsoluteKey(objectKey); err != nil {
		return nil, "", err
	}
	out, err := a.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, "", err
	}
	defer out.Body.Close()
	data, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, "", err
	}
	ct := ""
	if out.ContentType != nil {
		ct = *out.ContentType
	}
	return data, ct, nil
}

func (a *awsStore) Put(ctx context.Context, key, contentType string, data []byte) (UploadResult, error) {
	if err := ValidateKey(key); err != nil {
		return UploadResult{}, err
	}
	objectKey := ObjectKey(a.prefix, key)
	ct := contentType
	_, err := a.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(a.bucket),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: &ct,
	})
	if err != nil {
		return UploadResult{}, err
	}
	return UploadResult{
		Bucket: a.bucket, Key: objectKey, ContentType: contentType, Stored: true,
	}, nil
}

func (a *awsStore) Get(ctx context.Context, key string) ([]byte, string, error) {
	objectKey := ObjectKey(a.prefix, key)
	out, err := a.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(a.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, "", err
	}
	defer out.Body.Close()
	data, err := io.ReadAll(out.Body)
	if err != nil {
		return nil, "", err
	}
	ct := ""
	if out.ContentType != nil {
		ct = *out.ContentType
	}
	return data, ct, nil
}

func (a *awsStore) List(ctx context.Context, prefix string) ([]ObjectMeta, error) {
	searchPrefix := ObjectKey(a.prefix, prefix)
	out, err := a.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
		Bucket: aws.String(a.bucket),
		Prefix: aws.String(searchPrefix),
	})
	if err != nil {
		return nil, err
	}
	var items []ObjectMeta
	for _, obj := range out.Contents {
		if obj.Key == nil {
			continue
		}
		size := 0
		if obj.Size != nil {
			size = int(*obj.Size)
		}
		modified := ""
		if obj.LastModified != nil {
			modified = obj.LastModified.UTC().Format(time.RFC3339)
		}
		items = append(items, ObjectMeta{
			Key:          *obj.Key,
			ContentType:  ContentTypeFromKey(*obj.Key),
			Size:         size,
			LastModified: modified,
		})
	}
	return items, nil
}
