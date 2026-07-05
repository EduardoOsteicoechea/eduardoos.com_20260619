package main

import (
	"log"

	"eduardoos/internal/svc/tester"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(tester.Run(common.ListenAddr()))
}
