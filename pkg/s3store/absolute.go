package s3store

import "strings"

// ValidateAbsoluteKey rejects empty keys and path traversal for bucket-root objects.
func ValidateAbsoluteKey(objectKey string) error {
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" {
		return errKeyRequired()
	}
	if strings.HasPrefix(objectKey, "/") {
		return errInvalidKey()
	}
	if hasPathTraversal(objectKey) {
		return errInvalidKey()
	}
	return nil
}

func errKeyRequired() error {
	return validateError("key required")
}

func errInvalidKey() error {
	return validateError("invalid key")
}

type validateError string

func (e validateError) Error() string { return string(e) }
