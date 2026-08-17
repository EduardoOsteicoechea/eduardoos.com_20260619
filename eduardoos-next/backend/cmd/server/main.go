package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"eduardoos.nex/internal/admin"
	"eduardoos.nex/internal/aps"
	"eduardoos.nex/internal/auth"
	"eduardoos.nex/internal/church"
	"eduardoos.nex/internal/contact"
	"eduardoos.nex/internal/content"
	"eduardoos.nex/internal/documents"
	"eduardoos.nex/internal/edebat"
	"eduardoos.nex/internal/greek"
	"eduardoos.nex/internal/health"
	"eduardoos.nex/internal/homescool"
	"eduardoos.nex/internal/httpx"
	"eduardoos.nex/internal/instrumentalist"
	"eduardoos.nex/internal/payments"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// main boots the Eduardo OS Next monolith on ADDR (default :3001).
// Store backends are selected via DATABASE_BACKEND / HOMESCOOL_BACKEND /
// EPAMS_BACKEND / IFCBIM_BACKEND (memory default). DynamoDB mode falls back to
// memory when AWS creds are missing. Homescool teacher→student links follow
// HOMESCOOL_BACKEND or DATABASE_BACKEND into eduardoos_catalog.
// Greek catalog follows GREEK_BACKEND or DATABASE_BACKEND (same catalog table).
// Church catalog/memberships follow CHURCH_BACKEND or DATABASE_BACKEND.
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
	paymentsHandler.Users = userStore
	documentsHandler := documents.NewHandler(jwtSecret)
	edebatHandler := edebat.NewHandler(jwtSecret)
	instrumentalistHandler := instrumentalist.NewHandler(jwtSecret)
	homescoolHandler := homescool.NewHandler(jwtSecret, userStore)
	homescoolHandler.Links = homescool.OpenLinkStore(ctx)
	homescoolHandler.Tasks = homescool.OpenTaskStore(ctx)
	homescoolHandler.Objects = homescool.OpenObjectSpace(ctx)
	homescoolHandler.Mail = authHandler // shared SMTP_USER / SMTP_PASS path
	homescoolHandler.Entitlements = paymentsHandler.Store
	// Linked Homescool students bypass paid entitlement on CheckAccess only.
	paymentsHandler.HomescoolStudents = homescool.LinkStudentChecker{Links: homescoolHandler.Links}
	greekHandler := greek.NewHandler(jwtSecret, userStore)
	greekHandler.Catalog = greek.OpenCatalogStore(ctx)
	greekHandler.Objects = greek.OpenObjectSpace(ctx)
	churchHandler := church.NewHandler(jwtSecret, userStore)
	churchHandler.Catalog = church.OpenCatalogStore(ctx)
	churchHandler.Groups = church.OpenGroupStore(ctx)
	churchHandler.Memberships = church.OpenMembershipStore(ctx)
	churchHandler.Authorizations = church.OpenAuthorizationStore(ctx)
	churchHandler.Objects = church.OpenObjectSpace(ctx)
	churchHandler.Entitlements = paymentsHandler.Store
	churchHandler.Mail = authHandler // shared SMTP_USER / SMTP_PASS path
	contactHandler := contact.NewHandler(authHandler)
	adminHandler := admin.NewHandler(jwtSecret, userStore, paymentsHandler.Store)
	adminHandler.UseAuth(authHandler) // SMTP + store for bulk-register OTP mail
	adminHandler.ChurchAuth = churchHandler.Authorizations
	adminHandler.Mail = authHandler

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(httpx.CorrelationMiddleware)

	r.Get("/health", health.Handler("eduardoos-next"))

	authHandler.Routes(r)
	// Public visitor AI agent (no JWT): home dock + contact page.
	contactHandler.Routes(r)
	contentHandler.Routes(r)
	apsHandler.Routes(r)
	paymentsHandler.Routes(r)
	documentsHandler.Routes(r)
	edebatHandler.Routes(r)
	instrumentalistHandler.Routes(r)
	homescoolHandler.Routes(r)
	greekHandler.Routes(r)
	churchHandler.Routes(r)
	adminHandler.Routes(r)

	log.Printf("eduardoos-next backend listening on %s (prod tree uses :3000)", addr)
	log.Printf("stores: auth=%s homescool=%s homescool-tasks=%s greek=%s church=%s epams=%s ifcbim=%s",
		userStore.BackendName(), homescoolHandler.Links.BackendName(), homescoolHandler.Tasks.BackendName(),
		greekHandler.Catalog.BackendName(), churchHandler.Catalog.BackendName(),
		epamStore.BackendName(), bimStore.BackendName())
	// pass_set / pass_norm_len use normalizeSMTPPass (Unicode spaces + quotes stripped).
	// Never log the secret itself — only lengths for operator checks (Gmail app pw = 16).
	passNorm := auth.NormalizeSMTPPassForLog(authHandler.SMTPPass)
	smtpPassSet := passNorm != ""
	log.Printf("smtp: user=%s pass_set=%t pass_raw_len=%d pass_norm_len=%d dev_return_otp=%t",
		authHandler.SMTPUser, smtpPassSet, len(authHandler.SMTPPass), len(passNorm), authHandler.DevReturnOTP)
	if smtpPassSet && len(passNorm) != 16 {
		log.Printf("smtp: WARNING pass_norm_len=%d (Gmail App Passwords are exactly 16 chars) — check GitHub secret SMTP_PASS",
			len(passNorm))
	}
	if !smtpPassSet {
		log.Printf("smtp: WARNING SMTP_PASS empty after normalize — OTP/contact mail will log locally only")
	}
	log.Fatal(http.ListenAndServe(addr, r))
}
