package common

import "os"

// Env returns the environment variable or a fallback default.
func Env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ListenAddr returns the HTTP listen address for all microservices (port 3000).
func ListenAddr() string {
	if v := os.Getenv("PORT"); v != "" {
		return ":" + v
	}
	return ":3000"
}
