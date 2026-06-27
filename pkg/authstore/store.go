// Package authstore persists authenticator users and OTP codes via the database microservice.
package authstore

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"

	"eduardoos/pkg/common"
)

// User is a registered account record.
type User struct {
	Email        string `json:"email"`
	PasswordHash string `json:"passwordHash"`
	Verified     bool   `json:"verified"`
}

// Store abstracts user + OTP persistence.
type Store interface {
	GetUser(ctx context.Context, email string) (User, bool, error)
	PutUser(ctx context.Context, user User) error
	GetOTP(ctx context.Context, email string) (string, bool, error)
	PutOTP(ctx context.Context, email, otp string) error
	DeleteOTP(ctx context.Context, email string) error
	BackendName() string
}

// NormalizeEmail lowercases and trims login identifiers.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// New selects a database-backed store when databaseURL is set, otherwise memory.
func New(databaseURL, internalSecret string) Store {
	if strings.TrimSpace(databaseURL) == "" {
		return &memoryStore{users: map[string]User{}, otps: map[string]string{}}
	}
	return &databaseStore{
		baseURL: strings.TrimRight(databaseURL, "/"),
		secret:  internalSecret,
	}
}

type memoryStore struct {
	mu    sync.RWMutex
	users map[string]User
	otps  map[string]string
}

func (m *memoryStore) BackendName() string { return "memory" }

func (m *memoryStore) GetUser(_ context.Context, email string) (User, bool, error) {
	email = NormalizeEmail(email)
	m.mu.RLock()
	user, ok := m.users[email]
	m.mu.RUnlock()
	return user, ok, nil
}

func (m *memoryStore) PutUser(_ context.Context, user User) error {
	email := NormalizeEmail(user.Email)
	user.Email = email
	m.mu.Lock()
	m.users[email] = user
	m.mu.Unlock()
	return nil
}

func (m *memoryStore) GetOTP(_ context.Context, email string) (string, bool, error) {
	email = NormalizeEmail(email)
	m.mu.RLock()
	otp, ok := m.otps[email]
	m.mu.RUnlock()
	return otp, ok, nil
}

func (m *memoryStore) PutOTP(_ context.Context, email, otp string) error {
	email = NormalizeEmail(email)
	m.mu.Lock()
	m.otps[email] = otp
	m.mu.Unlock()
	return nil
}

func (m *memoryStore) DeleteOTP(_ context.Context, email string) error {
	email = NormalizeEmail(email)
	m.mu.Lock()
	delete(m.otps, email)
	m.mu.Unlock()
	return nil
}

type databaseStore struct {
	baseURL string
	secret  string
}

func (d *databaseStore) BackendName() string { return "database" }

func (d *databaseStore) GetUser(ctx context.Context, email string) (User, bool, error) {
	email = NormalizeEmail(email)
	var user User
	ok, err := d.getJSON(ctx, userKey(email), &user)
	if err != nil {
		return User{}, false, err
	}
	return user, ok, nil
}

func (d *databaseStore) PutUser(ctx context.Context, user User) error {
	user.Email = NormalizeEmail(user.Email)
	return d.putJSON(ctx, userKey(user.Email), user)
}

func (d *databaseStore) GetOTP(ctx context.Context, email string) (string, bool, error) {
	email = NormalizeEmail(email)
	var otp string
	ok, err := d.getJSON(ctx, otpKey(email), &otp)
	if err != nil || !ok || strings.TrimSpace(otp) == "" {
		return "", false, err
	}
	return otp, true, nil
}

func (d *databaseStore) PutOTP(ctx context.Context, email, otp string) error {
	email = NormalizeEmail(email)
	return d.putJSON(ctx, otpKey(email), otp)
}

func (d *databaseStore) DeleteOTP(ctx context.Context, email string) error {
	return d.putJSON(ctx, otpKey(NormalizeEmail(email)), "")
}

func userKey(email string) string { return "user:" + NormalizeEmail(email) }
func otpKey(email string) string  { return "otp:" + NormalizeEmail(email) }

func (d *databaseStore) getJSON(ctx context.Context, key string, dest any) (bool, error) {
	payload, _ := json.Marshal(map[string]string{"key": key})
	body, status, err := d.post(ctx, "/get", payload)
	if err != nil {
		return false, err
	}
	if status >= 400 {
		return false, fmt.Errorf("database get %s: %s", key, string(body))
	}
	var out struct {
		Value json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return false, err
	}
	if len(out.Value) == 0 || string(out.Value) == "null" || string(out.Value) == `""` {
		return false, nil
	}
	if err := json.Unmarshal(out.Value, dest); err != nil {
		return false, err
	}
	return true, nil
}

func (d *databaseStore) putJSON(ctx context.Context, key string, value any) error {
	payload, err := json.Marshal(map[string]any{"key": key, "value": value})
	if err != nil {
		return err
	}
	body, status, err := d.post(ctx, "/put", payload)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("database put %s: %s", key, string(body))
	}
	return nil
}

func (d *databaseStore) post(ctx context.Context, path string, payload []byte) ([]byte, int, error) {
	cid := "authstore"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(common.CorrelationHeader, cid)
	req.Header.Set(common.InternalTokenHeader, common.SignInternalToken(d.secret, cid))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return out, resp.StatusCode, nil
}
