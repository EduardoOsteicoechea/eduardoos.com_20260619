package main

import (
	"log"

	"eduardoos/internal/svc/documents"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(documents.Run(common.ListenAddr()))
}
