package main

import (
	"log"

	"eduardoos/internal/svc/payments"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(payments.Run(common.ListenAddr()))
}
