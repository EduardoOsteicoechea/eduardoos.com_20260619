package main

import (
	"log"

	"eduardoos/internal/svc/chatbot"
	"eduardoos/pkg/common"
)

func main() {
	log.Fatal(chatbot.Run(common.ListenAddr()))
}
