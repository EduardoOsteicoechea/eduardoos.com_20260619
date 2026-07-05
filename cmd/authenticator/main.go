package main

import (
	"log"

	"eduardoos/internal/svc/authenticator"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(authenticator.Run(common.ListenAddr()))
}
