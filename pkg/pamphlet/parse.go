package pamphlet

import (
	"fmt"
	"strings"
)

// FormatContentRef builds refs like "0:heading" or "0:subidea:3".
func FormatContentRef(ideaIndex int, kind string, subideaIndex int) string {
	if kind == "heading" {
		return fmt.Sprintf("%d:heading", ideaIndex)
	}
	return fmt.Sprintf("%d:subidea:%d", ideaIndex, subideaIndex)
}

// IdeaIntroMatchesHeader reports when the first idea duplicates header.json intro.
func IdeaIntroMatchesHeader(idea IdeaJSON, header HeaderPayload) bool {
	if header.Text != "" {
		return false
	}
	ideaHeading := strings.TrimSpace(idea.Heading)
	ideaSummary := strings.TrimSpace(idea.Summary)
	if ideaHeading == "" && ideaSummary == "" {
		return false
	}
	if ideaHeading != "" && strings.Contains(header.Heading, ideaHeading) {
		return true
	}
	if ideaSummary != "" && ideaSummary == header.Subheading {
		return true
	}
	combined := strings.TrimSpace(ideaHeading + " " + ideaSummary)
	headerCombined := strings.TrimSpace(header.Heading + " " + header.Subheading)
	if combined != "" && headerCombined != "" && strings.Contains(headerCombined, combined) {
		return true
	}
	return ideaHeading == header.Heading
}

// FlattenContent converts nested content JSON into sequential layout blocks.
func FlattenContent(content ContentPayload, header HeaderPayload) []LayoutBlock {
	blocks := make([]LayoutBlock, 0)
	for index, idea := range content.Ideas {
		skipIntro := index == 0 && IdeaIntroMatchesHeader(idea, header)
		blocks = append(blocks, flattenIdea(idea, index, skipIntro)...)
	}
	return blocks
}

func flattenIdea(idea IdeaJSON, ideaIndex int, skipIntro bool) []LayoutBlock {
	blocks := make([]LayoutBlock, 0)
	if !skipIntro {
		heading := strings.TrimSpace(idea.Heading)
		if heading != "" {
			blocks = append(blocks, LayoutBlock{
				Kind: BlockHeading, Text: heading,
				ContentRef: FormatContentRef(ideaIndex, "heading", 0),
				Highlights: append([]HighlightRange(nil), idea.HeadingHighlights...),
			})
		}
	}
	for subIdx, sub := range idea.Subideas {
		blocks = append(blocks, parseSubidea(sub, ideaIndex, subIdx))
	}
	return blocks
}

func parseSubidea(sub SubideaJSON, ideaIndex, subideaIndex int) LayoutBlock {
	ref := FormatContentRef(ideaIndex, "subidea", subideaIndex)
	kind := strings.ToLower(strings.TrimSpace(sub.Type))
	if kind == "" {
		kind = "simple_idea"
	}
	switch kind {
	case "quote":
		return LayoutBlock{
			Kind: BlockQuote, Text: strings.TrimSpace(sub.Content), ContentRef: ref,
			Highlights: append([]HighlightRange(nil), sub.Highlights...),
			References: append([]string(nil), sub.References...),
		}
	case "list":
		items := sub.Items
		if len(items) == 0 {
			items = []ListItemJSON{{Content: ""}}
		}
		listItems := make([]ListItem, 0, len(items))
		for _, raw := range items {
			listItems = append(listItems, ListItem{
				Text: strings.TrimSpace(raw.Content),
				Highlights: append([]HighlightRange(nil), raw.Highlights...),
			})
		}
		return LayoutBlock{Kind: BlockList, ContentRef: ref, ListItems: listItems}
	case "image":
		ratio := sub.AspectRatio
		if ratio <= 0 {
			ratio = 1
		}
		return LayoutBlock{
			Kind: BlockImage, Description: strings.TrimSpace(sub.Description),
			ImageURL: strings.TrimSpace(sub.Image), AspectRatio: ratio, ContentRef: ref,
		}
	default:
		return LayoutBlock{
			Kind: BlockParagraph, Text: strings.TrimSpace(sub.Content), ContentRef: ref,
			Highlights: append([]HighlightRange(nil), sub.Highlights...),
		}
	}
}

// ContentLength sums character counts across flattened blocks for capacity telemetry.
func ContentLength(blocks []LayoutBlock) int {
	total := 0
	for _, block := range blocks {
		switch block.Kind {
		case BlockParagraph, BlockHeading, BlockQuote:
			total += len(block.Text)
		case BlockList:
			for _, item := range block.ListItems {
				total += len(item.Text)
			}
		case BlockImage:
			total += len(block.Description)
		}
	}
	return total
}
