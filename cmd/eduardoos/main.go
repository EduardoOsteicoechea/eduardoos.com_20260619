// Eduardo OS unified backend — all Go microservices in one process (gateway on :3000).
package main

import (
	"log"

	"eduardoos/internal/monolith"
)

func main() {
	log.Printf("Eduardo OS monolith starting")
	if err := monolith.Run(); err != nil {
		log.Fatal(err)
	}
}
