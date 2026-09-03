// Command calvin-paragraphs-pack builds the parallel Institutes paragraph pack
// (spec 056) from a local copy of the 032 calvin-institutes/ tree.
//
// Usage:
//
//	go run ./backend/cmd/calvin-paragraphs-pack --in ./calvin-institutes --out ./calvin-institutes-paragraphs
//
// Upload out/ to s3://$BUCKET/calvin-institutes-paragraphs/ separately.
// This command never writes into the source Capita directory.
package main

import (
	"flag"
	"fmt"
	"os"

	"eduardoos.nex/internal/latin"
)

func main() {
	inDir := flag.String("in", "", "path to local calvin-institutes tree (index.json + sections/)")
	outDir := flag.String("out", "", "output directory for calvin-institutes-paragraphs pack")
	flag.Parse()
	if *inDir == "" || *outDir == "" {
		fmt.Fprintln(os.Stderr, "usage: calvin-paragraphs-pack --in <calvin-institutes-dir> --out <out-dir>")
		os.Exit(2)
	}
	idx, err := latin.BuildParagraphPackFromDir(*inDir, *outDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "build failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("wrote %d chapters / %d paragraphs (derivation=%s) → %s\n",
		idx.ChapterCount, idx.ParagraphCount, idx.Derivation, *outDir)
}
