package main

import (
	"log"

	"eduardoos/internal/svc/gateway"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(gateway.Run(common.ListenAddr()))
}
