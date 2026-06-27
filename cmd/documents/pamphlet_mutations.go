package main

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"eduardoos/pkg/pamphlet"
)

// applyContentMutation applies pamphlet content edits from the editor UI.
func applyContentMutation(doc *pamphlet.Document, req contentMutationRequest) (pamphlet.Document, string, error) {
	var newRef string
	switch req.Op {
	case "update":
		value := req.Value
		if value == "" {
			value = req.Text
		}
		if err := updateContentRef(doc, req.Ref, value, req.Field, req.ItemIndex); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "delete":
		if err := deleteContentRef(doc, req.Ref); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "move_up":
		if err := moveSubidea(doc, req.Ref, -1); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "move_down":
		if err := moveSubidea(doc, req.Ref, 1); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "insert_below":
		ref, err := insertSubideaBelow(doc, req.Ref, req.Value)
		if err != nil {
			return pamphlet.Document{}, "", err
		}
		newRef = ref
	case "update_image":
		if err := updateImageRef(doc, req.Ref, req.Value); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "clear_image":
		if err := updateImageRef(doc, req.Ref, ""); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "toggle_highlight", "highlight":
		if err := toggleHighlight(doc, req.Ref, req.Start, req.End, req.ItemIndex); err != nil {
			return pamphlet.Document{}, "", err
		}
	case "restore":
		if req.Content != nil {
			raw, err := mapToContent(req.Content)
			if err != nil {
				return pamphlet.Document{}, "", err
			}
			doc.Content = raw
		}
	default:
		return pamphlet.Document{}, "", fmt.Errorf("unsupported op %q", req.Op)
	}
	return *doc, newRef, nil
}

func mapToContent(m map[string]any) (pamphlet.ContentPayload, error) {
	var out pamphlet.ContentPayload
	b, err := json.Marshal(m)
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(b, &out); err != nil {
		return out, err
	}
	return out, nil
}

type parsedRef struct {
	ideaIdx int
	field   string
	subIdx  int
	hasSub  bool
}

func parseContentRef(ref string) (parsedRef, error) {
	parts := strings.Split(ref, ":")
	if len(parts) < 2 {
		return parsedRef{}, fmt.Errorf("invalid ref %q", ref)
	}
	ideaIdx, err := strconv.Atoi(parts[0])
	if err != nil {
		return parsedRef{}, fmt.Errorf("invalid ref %q", ref)
	}
	out := parsedRef{ideaIdx: ideaIdx, field: parts[1]}
	if parts[1] == "subidea" {
		if len(parts) != 3 {
			return parsedRef{}, fmt.Errorf("invalid ref %q", ref)
		}
		subIdx, err := strconv.Atoi(parts[2])
		if err != nil {
			return parsedRef{}, fmt.Errorf("invalid ref %q", ref)
		}
		out.subIdx = subIdx
		out.hasSub = true
	}
	return out, nil
}

func ideaForRef(doc *pamphlet.Document, ref parsedRef) (*pamphlet.IdeaJSON, error) {
	if ref.ideaIdx < 0 || ref.ideaIdx >= len(doc.Content.Ideas) {
		return nil, fmt.Errorf("idea index out of range")
	}
	return &doc.Content.Ideas[ref.ideaIdx], nil
}

func subideaForRef(doc *pamphlet.Document, ref parsedRef) (*pamphlet.SubideaJSON, error) {
	idea, err := ideaForRef(doc, ref)
	if err != nil {
		return nil, err
	}
	if !ref.hasSub || ref.subIdx < 0 || ref.subIdx >= len(idea.Subideas) {
		return nil, fmt.Errorf("subidea index out of range")
	}
	return &idea.Subideas[ref.subIdx], nil
}

func updateContentRef(doc *pamphlet.Document, ref, value, field string, itemIndex *int) error {
	if strings.HasPrefix(ref, "header:") || strings.HasPrefix(ref, "footer:") {
		return updateMetaRef(doc, ref, value)
	}
	parsed, err := parseContentRef(ref)
	if err != nil {
		return err
	}
	cleaned := strings.TrimSpace(value)
	if parsed.field == "heading" {
		idea, err := ideaForRef(doc, parsed)
		if err != nil {
			return err
		}
		idea.Heading = cleaned
		pamphlet.ClampHighlights(&idea.HeadingHighlights, len(cleaned))
		return nil
	}
	if parsed.field != "subidea" {
		return fmt.Errorf("invalid ref %q", ref)
	}
	sub, err := subideaForRef(doc, parsed)
	if err != nil {
		return err
	}
	kind := strings.ToLower(strings.TrimSpace(sub.Type))
	if kind == "" {
		kind = "simple_idea"
	}
	if kind == "list" && itemIndex != nil {
		idx := *itemIndex
		if idx < 0 || idx >= len(sub.Items) {
			return fmt.Errorf("list item index out of range")
		}
		sub.Items[idx].Content = cleaned
		pamphlet.ClampHighlights(&sub.Items[idx].Highlights, len(cleaned))
		return nil
	}
	if kind == "quote" && field == "reference" {
		if len(sub.References) == 0 {
			sub.References = []string{cleaned}
		} else {
			sub.References[0] = cleaned
		}
		return nil
	}
	if kind == "image" && (field == "description" || field == "reference") {
		sub.Description = cleaned
		return nil
	}
	if kind == "image" {
		sub.Description = cleaned
		return nil
	}
	if kind == "list" {
		return fmt.Errorf("cannot update list item inline without item_index")
	}
	sub.Content = cleaned
	pamphlet.ClampHighlights(&sub.Highlights, len(cleaned))
	return nil
}

func deleteContentRef(doc *pamphlet.Document, ref string) error {
	parsed, err := parseContentRef(ref)
	if err != nil {
		return err
	}
	if parsed.field != "subidea" {
		return fmt.Errorf("only subideas can be deleted")
	}
	idea, err := ideaForRef(doc, parsed)
	if err != nil {
		return err
	}
	if !parsed.hasSub || parsed.subIdx >= len(idea.Subideas) {
		return fmt.Errorf("subidea index out of range")
	}
	idea.Subideas = append(idea.Subideas[:parsed.subIdx], idea.Subideas[parsed.subIdx+1:]...)
	return nil
}

func moveSubidea(doc *pamphlet.Document, ref string, delta int) error {
	parsed, err := parseContentRef(ref)
	if err != nil {
		return err
	}
	if parsed.field != "subidea" {
		return fmt.Errorf("only subideas can be reordered")
	}
	idea, err := ideaForRef(doc, parsed)
	if err != nil {
		return err
	}
	from := parsed.subIdx
	to := from + delta
	if from < 0 || from >= len(idea.Subideas) || to < 0 || to >= len(idea.Subideas) {
		return fmt.Errorf("cannot move subidea")
	}
	subideas := idea.Subideas
	subideas[from], subideas[to] = subideas[to], subideas[from]
	return nil
}

const defaultInsertParagraphText = "New paragraph"

func insertSubideaBelow(doc *pamphlet.Document, ref, text string) (string, error) {
	parsed, err := parseContentRef(ref)
	if err != nil {
		return "", err
	}
	if parsed.field != "subidea" {
		return "", fmt.Errorf("only subideas support insert_below")
	}
	idea, err := ideaForRef(doc, parsed)
	if err != nil {
		return "", err
	}
	insertAt := parsed.subIdx + 1
	if insertAt > len(idea.Subideas) {
		insertAt = len(idea.Subideas)
	}
	content := strings.TrimSpace(text)
	if content == "" {
		content = defaultInsertParagraphText
	}
	newSub := pamphlet.SubideaJSON{Type: "simple_idea", Content: content}
	tail := append([]pamphlet.SubideaJSON{}, idea.Subideas[insertAt:]...)
	idea.Subideas = append(idea.Subideas[:insertAt], newSub)
	idea.Subideas = append(idea.Subideas, tail...)
	return pamphlet.FormatContentRef(parsed.ideaIdx, "subidea", insertAt), nil
}

func toggleHighlight(doc *pamphlet.Document, ref string, start, end int, itemIndex *int) error {
	parsed, err := parseContentRef(ref)
	if err != nil {
		return err
	}
	if start < 0 {
		start = 0
	}
	if end < start {
		end = start
	}
	if parsed.field == "heading" {
		idea, err := ideaForRef(doc, parsed)
		if err != nil {
			return err
		}
		idea.HeadingHighlights = pamphlet.ToggleTextHighlight(idea.HeadingHighlights, start, end)
		return nil
	}
	if parsed.field != "subidea" {
		return fmt.Errorf("invalid ref %q", ref)
	}
	sub, err := subideaForRef(doc, parsed)
	if err != nil {
		return err
	}
	if strings.ToLower(sub.Type) == "list" && itemIndex != nil {
		idx := *itemIndex
		if idx < 0 || idx >= len(sub.Items) {
			return fmt.Errorf("list item index out of range")
		}
		sub.Items[idx].Highlights = pamphlet.ToggleTextHighlight(sub.Items[idx].Highlights, start, end)
		return nil
	}
	sub.Highlights = pamphlet.ToggleTextHighlight(sub.Highlights, start, end)
	return nil
}

func updateImageRef(doc *pamphlet.Document, ref, objectKey string) error {
	parsed, err := parseContentRef(ref)
	if err != nil {
		return err
	}
	if parsed.field != "subidea" {
		return fmt.Errorf("only subidea image refs are supported")
	}
	sub, err := subideaForRef(doc, parsed)
	if err != nil {
		return err
	}
	if strings.ToLower(strings.TrimSpace(sub.Type)) != "image" {
		return fmt.Errorf("ref is not an image subidea")
	}
	sub.Image = strings.TrimSpace(objectKey)
	return nil
}

func updateMetaRef(doc *pamphlet.Document, ref, value string) error {
	cleaned := strings.TrimSpace(value)
	parts := strings.Split(ref, ":")
	if len(parts) < 2 {
		return fmt.Errorf("invalid meta ref %q", ref)
	}
	zone := parts[0]
	field := parts[1]
	switch zone {
	case "header":
		switch field {
		case "text":
			doc.Header.Text = cleaned
		case "heading":
			doc.Header.Heading = cleaned
		case "subheading":
			doc.Header.Subheading = cleaned
		case "author":
			doc.Header.Author = cleaned
		case "date":
			doc.Header.Date = cleaned
		case "category":
			doc.Header.Category = cleaned
		default:
			return fmt.Errorf("unknown header field %q", field)
		}
	case "footer":
		switch field {
		case "text":
			doc.Footer.Text = cleaned
		case "heading":
			doc.Footer.Heading = cleaned
		case "address":
			doc.Footer.AddressData.Address = cleaned
		case "contact":
			if len(parts) != 3 {
				return fmt.Errorf("invalid footer contact ref %q", ref)
			}
			idx, err := strconv.Atoi(parts[2])
			if err != nil {
				return err
			}
			for len(doc.Footer.ContactItems) <= idx {
				doc.Footer.ContactItems = append(doc.Footer.ContactItems, pamphlet.FooterContact{})
			}
			doc.Footer.ContactItems[idx].Value = cleaned
		default:
			return fmt.Errorf("unknown footer field %q", field)
		}
	default:
		return fmt.Errorf("unknown zone %q", zone)
	}
	return nil
}
