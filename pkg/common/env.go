package common

import "os"

func Env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func ListenAddr() string {
	if v := os.Getenv("PORT"); v != "" {
		return ":" + v
	}
	return ":3000"
}
