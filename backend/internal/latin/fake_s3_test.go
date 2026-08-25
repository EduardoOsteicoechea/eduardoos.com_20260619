package latin

import (
	"context"
	"io"
	"strings"

	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type fakeS3 struct {
	objects map[string]string
}

func (f *fakeS3) GetObject(ctx context.Context, params *s3.GetObjectInput, optFns ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	_ = ctx
	_ = optFns
	key := ""
	if params.Key != nil {
		key = *params.Key
	}
	body, ok := f.objects[key]
	if !ok {
		return nil, simpleErr("NoSuchKey: " + key)
	}
	return &s3.GetObjectOutput{
		Body: io.NopCloser(strings.NewReader(body)),
	}, nil
}

type simpleErr string

func (e simpleErr) Error() string { return string(e) }
