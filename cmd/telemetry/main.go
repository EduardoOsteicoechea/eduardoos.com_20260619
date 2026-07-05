package main

import (
	"log"

	"eduardoos/internal/svc/telemetry"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(telemetry.Run(common.ListenAddr()))
}
