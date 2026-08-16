package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"

	"eduardoos.nex/internal/admin"
	"eduardoos.nex/internal/aps"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/content"
	"eduardoos.nex/internal/documents"
	"eduardoos.nex/internal/edebat"
	"eduardoos.nex/internal/health"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/instrumentalist"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// main boots the Eduardo OS Next monolith on ADDR (default :3001).
// Store backends are selected via DATABASE_BACKEND / EPAMS_BACKEND / IFCBIM_BACKEND
// (memory default). DynamoDB mode falls back to memory when AWS creds are missing.
// SMTP_USER / SMTP_PASS drive OTP email delivery; empty SMTP_PASS logs codes locally.
// DEV_RETURN_OTP=1 includes OTP in JSON for local testing only.
func main() {
	ctx := context.Background()
	addr := httpx.Env("ADDR", ":3001")
	if port := os.Getenv("PORT"); port != "" {
		// PORT overrides ADDR when set (staging/systemd convenience).
		if port[0] != ':' {
			addr = ":" + port
		} else {
			addr = port
		}
	}
	jwtSecret := httpx.Env("JWT_SECRET", "dev-jwt-secret")

	userStore := auth.OpenUserStore(ctx)
	epamStore := content.OpenEpamStore(ctx)
	bimStore := content.OpenBIMStore(ctx)

	authHandler := &auth.Handler{
		Store:        userStore,
		JWTSecret:    jwtSecret,
		SMTPUser:     httpx.Env("SMTP_USER", "eduardooost@gmail.com"),
		SMTPPass:     os.Getenv("SMTP_PASS"),
		DevReturnOTP: os.Getenv("DEV_RETURN_OTP") == "1",
	}
	contentHandler := content.NewHandler(jwtSecret, epamStore, bimStore)
	apsHandler := &aps.Handler{
		JWTSecret: jwtSecret,
		Client:    aps.NewClient(aps.LoadConfig()),
	}
	paymentsHandler := payments.NewHandler(jwtSecret, httpx.Env("PAYPAL_HOSTED_BUTTON_ID", "PLACEHOLDER_HOSTED_BUTTON"))
	documentsHandler := documents.NewHandler(jwtSecret)
	edebatHandler := edebat.NewHandler(jwtSecret)
	instrumentalistHandler := instrumentalist.NewHandler(jwtSecret)
	adminHandler := admin.NewHandler(jwtSecret, userStore, paymentsHandler.Store)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(httpx.CorrelationMiddleware)

	r.Get("/health", health.Handler("eduardoos-next"))

	authHandler.Routes(r)
	contentHandler.Routes(r)
	apsHandler.Routes(r)
	paymentsHandler.Routes(r)
	documentsHandler.Routes(r)
	edebatHandler.Routes(r)
	instrumentalistHandler.Routes(r)
	adminHandler.Routes(r)

	log.Printf("eduardoos-next backend listening on %s (prod tree uses :3000)", addr)
	log.Printf("stores: auth=%s epams=%s ifcbim=%s", userStore.BackendName(), epamStore.BackendName(), bimStore.BackendName())
	// pass_set uses normalized password (spaces stripped) so Gmail display-spaced
	// app passwords still count as configured; never log the secret itself.
	smtpPassSet := strings.ReplaceAll(strings.TrimSpace(authHandler.SMTPPass), " ", "") != ""
	log.Printf("smtp: user=%s pass_set=%t pass_raw_len=%d dev_return_otp=%t",
		authHandler.SMTPUser, smtpPassSet, len(authHandler.SMTPPass), authHandler.DevReturnOTP)
	log.Fatal(http.ListenAndServe(addr, r))
}
