package admin

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/httpx"
)

// MaxBulkRegisterUsers caps one admin paste/upload batch (DoS / SMTP flood).
const MaxBulkRegisterUsers = 100

// bulkRegisterRow is one account in the admin JSON batch.
// Accepts English and Spanish field aliases (name/nombre, email/correo,
// password/contraseña|contrasena). Password is never written to logs.
type bulkRegisterRow struct {
	Name       string `json:"name"`
	Nombre     string `json:"nombre"`
	Email      string `json:"email"`
	Correo     string `json:"correo"`
	Password   string `json:"password"`
	Contrasena string `json:"contrasena"`
	ContrasenaAccent string `json:"contraseña"`
}

func (row bulkRegisterRow) resolvedName() string {
	if n := strings.TrimSpace(row.Name); n != "" {
		return n
	}
	return strings.TrimSpace(row.Nombre)
}

func (row bulkRegisterRow) resolvedEmail() string {
	if e := strings.TrimSpace(row.Email); e != "" {
		return e
	}
	return strings.TrimSpace(row.Correo)
}

func (row bulkRegisterRow) resolvedPassword() string {
	if row.Password != "" {
		return row.Password
	}
	if row.Contrasena != "" {
		return row.Contrasena
	}
	return row.ContrasenaAccent
}

// bulkRegisterResult is one per-row outcome returned to the admin UI.
type bulkRegisterResult struct {
	Index  int    `json:"index"`
	Email  string `json:"email"`
	Name   string `json:"name,omitempty"`
	Status string `json:"status"` // "created" | "failed"
	Reason string `json:"reason,omitempty"`
}

// BulkRegister creates many unverified accounts from a JSON array (or
// {"users":[...]}), same store + OTP SMTP path as public register.
// Failures are reported per row; the batch continues. Platform admin only.
func (h *Handler) BulkRegister(w http.ResponseWriter, r *http.Request) {
	cid := httpx.CorrelationFromRequest(r)
	if h.auth == nil || h.Users == nil {
		httpx.WriteError(w, http.StatusInternalServerError, "auth not configured")
		return
	}

	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MiB
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid payload")
		return
	}
	rows, parseErr := parseBulkRegisterJSON(raw)
	if parseErr != "" {
		httpx.WriteError(w, http.StatusBadRequest, parseErr)
		return
	}
	if len(rows) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "empty user list")
		return
	}
	if len(rows) > MaxBulkRegisterUsers {
		httpx.WriteError(w, http.StatusBadRequest, "too many users (max 100)")
		return
	}

	log.Printf("[correlation=%s] admin.bulk_register begin count=%d (passwords never logged)", cid, len(rows))

	seen := map[string]bool{}
	results := make([]bulkRegisterResult, 0, len(rows))
	created := 0
	failed := 0

	for i, row := range rows {
		name := row.resolvedName()
		emailRaw := row.resolvedEmail()
		password := row.resolvedPassword()
		emailNorm := auth.NormalizeEmail(emailRaw)

		item := bulkRegisterResult{
			Index:  i,
			Email:  emailNorm,
			Name:   name,
			Status: "failed",
		}

		if emailNorm == "" {
			item.Reason = "invalid email"
			failed++
			results = append(results, item)
			continue
		}
		if seen[emailNorm] {
			item.Reason = "duplicate email in batch"
			failed++
			results = append(results, item)
			continue
		}
		seen[emailNorm] = true

		// Password length checked inside RegisterUnverifiedAccount; clear local
		// reference after call so stack dumps are less likely to retain it.
		outcome := h.auth.RegisterUnverifiedAccount(r.Context(), cid, auth.RegisterAccountInput{
			Email:             emailRaw,
			Password:          password,
			Name:              name,
			EnforceSpamFilter: false,
		})

		item.Email = outcome.Email
		if outcome.Name != "" {
			item.Name = outcome.Name
		}
		if outcome.OK {
			item.Status = "created"
			item.Reason = ""
			created++
		} else {
			item.Reason = outcome.Reason
			failed++
		}
		results = append(results, item)
	}

	log.Printf("[correlation=%s] admin.bulk_register done created=%d failed=%d", cid, created, failed)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"created": created,
		"failed":  failed,
		"results": results,
	})
}

// parseBulkRegisterJSON accepts a top-level array or {"users":[...]}.
func parseBulkRegisterJSON(raw []byte) ([]bulkRegisterRow, string) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" {
		return nil, "invalid payload"
	}
	if strings.HasPrefix(trimmed, "[") {
		var rows []bulkRegisterRow
		if err := json.Unmarshal([]byte(trimmed), &rows); err != nil {
			return nil, "invalid JSON array"
		}
		return rows, ""
	}
	var wrapped struct {
		Users []bulkRegisterRow `json:"users"`
	}
	if err := json.Unmarshal([]byte(trimmed), &wrapped); err != nil {
		return nil, "invalid JSON object (expected array or {\"users\":[...]})"
	}
	return wrapped.Users, ""
}
