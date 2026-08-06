package monolith

import (
	"log"
	"os"
	"sync"

	"eduardoos/internal/svc/authenticator"
	"eduardoos/internal/svc/chatbot"
	"eduardoos/internal/svc/database"
	"eduardoos/internal/svc/documents"
	"eduardoos/internal/svc/gateway"
	"eduardoos/internal/svc/payments"
	"eduardoos/internal/svc/s3"
	"eduardoos/internal/svc/telemetry"
	"eduardoos/internal/svc/tester"
)

const (
	PortGateway       = ":3000"
	PortDatabase      = ":3010"
	PortAuthenticator = ":3011"
	PortTelemetry     = ":3012"
	PortDocuments     = ":3013"
	PortS3            = ":3014"
	PortTester        = ":3015"
	PortPayments      = ":3016"
	PortChatbot       = ":3017"
)

func ConfigureServiceURLs() {
	_ = os.Setenv("AUTHENTICATOR_URL", "http://127.0.0.1"+PortAuthenticator)
	_ = os.Setenv("TELEMETRY_URL", "http://127.0.0.1"+PortTelemetry)
	_ = os.Setenv("TESTER_URL", "http://127.0.0.1"+PortTester)
	_ = os.Setenv("PAYMENTS_URL", "http://127.0.0.1"+PortPayments)
	_ = os.Setenv("S3_URL", "http://127.0.0.1"+PortS3)
	_ = os.Setenv("DOCUMENTS_URL", "http://127.0.0.1"+PortDocuments)
	_ = os.Setenv("DATABASE_URL", "http://127.0.0.1"+PortDatabase)
}

type service struct {
	name string
	addr string
	run  func(string) error
}

func Run() error {
	ConfigureServiceURLs()

	services := []service{
		{name: "database", addr: PortDatabase, run: database.Run},
		{name: "telemetry", addr: PortTelemetry, run: telemetry.Run},
		{name: "s3", addr: PortS3, run: s3.Run},
		{name: "documents", addr: PortDocuments, run: documents.Run},
		{name: "authenticator", addr: PortAuthenticator, run: authenticator.Run},
		{name: "tester", addr: PortTester, run: tester.Run},
		{name: "payments", addr: PortPayments, run: payments.Run},
		{name: "chatbot", addr: PortChatbot, run: chatbot.Run},
	}

	var wg sync.WaitGroup
	errCh := make(chan error, len(services)+1)

	for _, svc := range services {
		wg.Add(1)
		go func(s service) {
			defer wg.Done()
			log.Printf("monolith starting %s on %s", s.name, s.addr)
			if err := s.run(s.addr); err != nil {
				errCh <- err
			}
		}(svc)
	}

	log.Printf("monolith starting gateway on %s", PortGateway)
	if err := gateway.Run(PortGateway); err != nil {
		return err
	}
	return nil
}
