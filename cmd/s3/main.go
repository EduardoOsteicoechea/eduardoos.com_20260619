package main

import (
	"log"

	"eduardoos/internal/svc/s3"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(s3.Run(common.ListenAddr()))
}
