package main

import (
	"log"

	"eduardoos/internal/svc/database"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(database.Run(common.ListenAddr()))
}
