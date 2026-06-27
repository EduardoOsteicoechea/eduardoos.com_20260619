package pamphlet

import (
	"fmt"
	"html"
	"strings"
)

func editableAttrs(contentRef string) string {
	if contentRef == "" {
		return ""
	}
	return fmt.Sprintf(` data-content-ref="%s" tabindex="0"`, html.EscapeString(contentRef))
}

func imageSrc(imageURL string) string {
	if imageURL == "" {
		return ""
	}
	if strings.HasPrefix(imageURL, "http://") || strings.HasPrefix(imageURL, "https://") || strings.HasPrefix(imageURL, "/") {
		return imageURL
	}
	if strings.HasPrefix(imageURL, ContentImagePrefix+"/") || strings.HasPrefix(imageURL, ContentImagePrefix) {
		return GatewayImagePath(imageURL)
	}
	return "/api/pamphlets/images/" + imageURL
}

func renderLayoutBlock(block LayoutBlock, columnWidthMM, headingBottomMarginMM, marginBottomMM float64) string {
	switch block.Kind {
	case BlockHeading:
		style := ""
		if headingBottomMarginMM > 0 {
			style = fmt.Sprintf(` style="margin-bottom:%.4fmm"`, headingBottomMarginMM)
		}
		inner := RenderHighlightedText(block.Text, block.Highlights)
		cls := "block-heading"
		if block.ContentRef != "" {
			cls += " editable-block"
		}
		return fmt.Sprintf(`<div class="%s"%s%s>%s</div>`, cls, style, editableAttrs(block.ContentRef), inner)
	case BlockParagraph:
		cls := "block-paragraph"
		if block.ContentRef != "" {
			cls += " editable-block"
		}
		style := ""
		if marginBottomMM > 0 {
			style = fmt.Sprintf(` style="margin-bottom:%.4fmm"`, marginBottomMM)
		}
		inner := RenderHighlightedText(block.Text, block.Highlights)
		return fmt.Sprintf(`<p class="%s"%s%s>%s</p>`, cls, style, editableAttrs(block.ContentRef), inner)
	case BlockList:
		cls := "block-list"
		if block.ContentRef != "" {
			cls += " editable-type-block"
		}
		style := ""
		if marginBottomMM > 0 {
			style = fmt.Sprintf(` style="margin-bottom:%.4fmm"`, marginBottomMM)
		}
		var items strings.Builder
		for _, item := range block.ListItems {
			inner := RenderHighlightedText(item.Text, item.Highlights)
			items.WriteString(`<li class="block-list-item">`)
			items.WriteString(inner)
			items.WriteString(`</li>`)
		}
		return fmt.Sprintf(`<ul class="%s"%s%s>%s</ul>`, cls, style, editableAttrs(block.ContentRef), items.String())
	case BlockQuote:
		cls := "block-quote"
		if block.ContentRef != "" {
			cls += " editable-type-block"
		}
		style := ""
		if marginBottomMM > 0 {
			style = fmt.Sprintf(` style="margin-bottom:%.4fmm"`, marginBottomMM)
		}
		inner := RenderHighlightedText(block.Text, block.Highlights)
		var refs strings.Builder
		for _, r := range block.References {
			if r == "" {
				continue
			}
			esc := html.EscapeString(r)
			refs.WriteString(fmt.Sprintf(`<a href="%s">%s</a> `, esc, esc))
		}
		refsHTML := ""
		if refs.Len() > 0 {
			refsHTML = fmt.Sprintf(`<div class="block-quote-refs">%s</div>`, strings.TrimSpace(refs.String()))
		}
		return fmt.Sprintf(`<blockquote class="%s"%s%s><em>%s</em>%s</blockquote>`, cls, style, editableAttrs(block.ContentRef), inner, refsHTML)
	case BlockImage:
		cls := "block-image-wrap"
		if block.ContentRef != "" {
			cls += " editable-type-block"
		}
		style := ""
		if marginBottomMM > 0 {
			style = fmt.Sprintf(` style="margin-bottom:%.4fmm"`, marginBottomMM)
		}
		ratioPct := 100.0
		if block.AspectRatio > 0 {
			ratioPct = (1 / block.AspectRatio) * 100
		}
		src := imageSrc(block.ImageURL)
		media := `<span class="block-image-placeholder" aria-hidden="true"></span>`
		if src != "" {
			media = fmt.Sprintf(
				`<img src="%s" alt="%s" class="block-image-img" loading="lazy" onerror="this.classList.add('is-broken');this.style.display='none';this.closest('.block-image-wrap')?.classList.add('is-broken')">`,
				html.EscapeString(src), html.EscapeString(block.Description),
			)
		}
		brokenBtn := ""
		if block.ContentRef != "" {
			brokenBtn = `<button type="button" class="block-image-clear" data-image-clear="1" title="Remove image reference">✕</button>`
		}
		return fmt.Sprintf(
			`<div class="%s"%s%s>%s<div class="block-image" style="padding-bottom:%.2f%%">%s</div><div class="block-image-ref">%s</div></div>`,
			cls, style, editableAttrs(block.ContentRef), brokenBtn, ratioPct, media, html.EscapeString(block.Description),
		)
	default:
		return ""
	}
}

func renderColumnBlocks(blocks []LayoutBlock, columnWidthMM, paragraphSepMM, headingBottomMarginMM float64) string {
	lastPara := LastParagraphIndex(blocks)
	var b strings.Builder
	for i, block := range blocks {
		if block.Kind == BlockParagraph {
			sep := paragraphSepMM
			if i == lastPara {
				sep = 0
			}
			b.WriteString(renderLayoutBlock(block, columnWidthMM, 0, sep))
			continue
		}
		sep := paragraphSepMM
		if i == len(blocks)-1 {
			sep = 0
		}
		b.WriteString(renderLayoutBlock(block, columnWidthMM, headingBottomMarginMM, sep))
	}
	return b.String()
}

func renderColumnDiv(id string, blocks []LayoutBlock, colWidth, colHeight, fontSizePt, lh, paraSep, headingGap float64, mobileOrder int) string {
	inner := renderColumnBlocks(blocks, colWidth, paraSep, headingGap)
	orderAttr := ""
	if mobileOrder > 0 {
		orderAttr = fmt.Sprintf(` data-mobile-order="%d"`, mobileOrder)
	}
	return fmt.Sprintf(
		`<div id="%s" class="column"%s data-base-max-height-mm="%.4f" style="font-size:%gpt;line-height:%g;max-height:%.4fmm;height:100%%;overflow:hidden">%s</div>`,
		id, orderAttr, colHeight, fontSizePt, lh, colHeight, inner,
	)
}

func renderHeaderZone(payload HeaderPayload) string {
	if payload.Text != "" {
		return fmt.Sprintf(`<div class="pamphlet-header-text editable-block" data-content-ref="header:text" tabindex="0">%s</div>`, html.EscapeString(payload.Text))
	}
	var b strings.Builder
	b.WriteString(`<div class="pamphlet-header">`)
	if payload.Heading != "" {
		b.WriteString(fmt.Sprintf(`<div class="pamphlet-header-title editable-block" data-content-ref="header:heading" tabindex="0">%s</div>`, html.EscapeString(payload.Heading)))
	} else {
		b.WriteString(`<div class="pamphlet-header-title editable-block" data-content-ref="header:heading" tabindex="0"></div>`)
	}
	if payload.Subheading != "" {
		b.WriteString(fmt.Sprintf(`<div class="pamphlet-header-sub editable-block" data-content-ref="header:subheading" tabindex="0">%s</div>`, html.EscapeString(payload.Subheading)))
	}
	meta := make([]string, 0, 3)
	if payload.Author != "" {
		meta = append(meta, fmt.Sprintf(`<span class="editable-block" data-content-ref="header:author" tabindex="0">%s</span>`, html.EscapeString(payload.Author)))
	}
	if payload.Date != "" {
		meta = append(meta, fmt.Sprintf(`<span class="editable-block" data-content-ref="header:date" tabindex="0">%s</span>`, html.EscapeString(payload.Date)))
	}
	if payload.Category != "" {
		meta = append(meta, fmt.Sprintf(`<span class="editable-block" data-content-ref="header:category" tabindex="0">%s</span>`, html.EscapeString(payload.Category)))
	}
	if len(meta) > 0 {
		b.WriteString(fmt.Sprintf(`<div class="pamphlet-header-meta">%s</div>`, strings.Join(meta, " · ")))
	}
	b.WriteString(`</div>`)
	return b.String()
}

func renderFooterZone(payload FooterPayload) string {
	if payload.Text != "" {
		return fmt.Sprintf(`<div class="pamphlet-footer-text editable-block" data-content-ref="footer:text" tabindex="0">%s</div>`, html.EscapeString(payload.Text))
	}
	var b strings.Builder
	b.WriteString(`<div class="pamphlet-footer">`)
	if payload.Heading != "" {
		b.WriteString(fmt.Sprintf(`<div class="pamphlet-footer-title editable-block" data-content-ref="footer:heading" tabindex="0">%s</div>`, html.EscapeString(payload.Heading)))
	} else {
		b.WriteString(`<div class="pamphlet-footer-title editable-block" data-content-ref="footer:heading" tabindex="0"></div>`)
	}
	for i, item := range payload.ContactItems {
		line := strings.TrimSpace(item.Type + ": " + item.Value)
		if line == ":" {
			line = item.Value
		}
		ref := fmt.Sprintf("footer:contact:%d", i)
		b.WriteString(fmt.Sprintf(`<div class="pamphlet-footer-line editable-block" data-content-ref="%s" tabindex="0">%s</div>`, ref, html.EscapeString(line)))
	}
	if payload.AddressData.Message != "" || payload.AddressData.Address != "" {
		addr := strings.TrimSpace(payload.AddressData.Message + " " + payload.AddressData.Address)
		b.WriteString(fmt.Sprintf(`<div class="pamphlet-footer-address editable-block" data-content-ref="footer:address" tabindex="0">%s</div>`, html.EscapeString(addr)))
	}
	b.WriteString(`</div>`)
	return b.String()
}

// RenderSheet1Outer renders sheet 1 outside face HTML.
func RenderSheet1Outer(cfg LayoutConfig, header HeaderPayload, footer FooterPayload, distributed [][]LayoutBlock, heights []float64) string {
	colW := columnWidthMM(cfg)
	paraSep := ParagraphSeparationMM(cfg.FontSizePt, cfg.LineHeightFactor, cfg.ParagraphSeparationFactor)
	fs, lh := cfg.FontSizePt, cfg.LineHeightFactor
	s1r := renderColumnDiv("s1r-col0", distributed[0], colW, heights[0], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 2)
	s1r += renderColumnDiv("s1r-col1", distributed[1], colW, heights[1], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 3)
	s1l := renderColumnDiv("s1l-col0", distributed[6], colW, heights[6], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 100)
	s1l += renderColumnDiv("s1l-col1", distributed[7], colW, heights[7], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 101)
	return fmt.Sprintf(`
<div class="sheet" id="sheet1" data-sheet-index="1" style="--mid-gap:%.4fmm;--col-gap:%.4fmm;--hf-gap:%.4fmm">
  <div class="sheet-inner sheet1-grid" style="padding:%.4fmm %.4fmm">
    <div class="block left sheet1-left">
      <div class="zone-body" id="s1-left-body">%s</div>
      <div class="zone-gap"></div>
      <div class="zone-footer" id="zone-footer" data-mobile-order="99" style="font-size:%gpt;line-height:%g">%s</div>
    </div>
    <div class="gutter" id="mid-gutter"></div>
    <div class="block right sheet1-right">
      <div class="zone-header" id="zone-header" data-mobile-order="1" style="font-size:%gpt;line-height:%g">%s</div>
      <div class="zone-gap"></div>
      <div class="zone-body" id="s1-right-body">%s</div>
    </div>
  </div>
</div>`,
		cfg.MidSeparationMM, cfg.ColumnGapMM, cfg.HeaderFooterGapMM,
		cfg.MarginVerticalMM, cfg.MarginLateralMM,
		s1l, fs, lh, renderFooterZone(footer),
		fs, lh, renderHeaderZone(header), s1r,
	)
}

// RenderSheet2Inner renders sheet 2 inside face HTML.
func RenderSheet2Inner(cfg LayoutConfig, distributed [][]LayoutBlock, heights []float64) string {
	colW := columnWidthMM(cfg)
	paraSep := ParagraphSeparationMM(cfg.FontSizePt, cfg.LineHeightFactor, cfg.ParagraphSeparationFactor)
	fs, lh := cfg.FontSizePt, cfg.LineHeightFactor
	s2l := renderColumnDiv("s2l-col0", distributed[2], colW, heights[2], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 4)
	s2l += renderColumnDiv("s2l-col1", distributed[3], colW, heights[3], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 5)
	s2r := renderColumnDiv("s2r-col0", distributed[4], colW, heights[4], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 6)
	s2r += renderColumnDiv("s2r-col1", distributed[5], colW, heights[5], fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 7)
	return fmt.Sprintf(`
<div class="sheet" id="sheet2" data-sheet-index="2" style="--mid-gap:%.4fmm;--col-gap:%.4fmm">
  <div class="sheet-inner sheet2-grid" style="padding:%.4fmm %.4fmm">
    <div class="block left sheet2-left"><div class="zone-body" id="s2-left-body">%s</div></div>
    <div class="gutter" id="mid-gutter-2"></div>
    <div class="block right sheet2-right"><div class="zone-body" id="s2-right-body">%s</div></div>
  </div>
</div>`,
		cfg.MidSeparationMM, cfg.ColumnGapMM,
		cfg.MarginVerticalMM, cfg.MarginLateralMM,
		s2l, s2r,
	)
}

// RenderPreviewSheets returns the sheet HTML fragment for the editor preview pane.
func RenderPreviewSheets(cfg LayoutConfig, doc Document) string {
	rects := EightColumnRects(cfg, doc.Header, doc.Footer)
	heights := make([]float64, len(rects))
	widths := make([]float64, len(rects))
	for i, r := range rects {
		heights[i] = r.HeightMM
		widths[i] = r.WidthMM
	}
	blocks := FlattenContent(doc.Content, doc.Header)
	distributed := DistributeBlocksFlow(blocks, cfg, doc.Header, doc.Footer)
	var html strings.Builder
	html.WriteString(RenderSheet1Outer(cfg, doc.Header, doc.Footer, distributed, heights))
	if sheet1RightFull(distributed, heights, cfg) && sheet2HasContent(distributed) {
		html.WriteString(RenderSheet2Inner(cfg, distributed, heights))
	}
	for i, group := range overflowPageGroups(distributed) {
		html.WriteString(RenderOverflowSheet(cfg, group, heights, i+3))
	}
	return html.String()
}

// RenderOverflowSheet renders sheet 3+ as four-column pages (same topology as sheet 2).
func RenderOverflowSheet(cfg LayoutConfig, cols [][]LayoutBlock, heights []float64, pageNum int) string {
	colW := columnWidthMM(cfg)
	paraSep := ParagraphSeparationMM(cfg.FontSizePt, cfg.LineHeightFactor, cfg.ParagraphSeparationFactor)
	fs, lh := cfg.FontSizePt, cfg.LineHeightFactor
	bodyH := contentHeightMM(cfg)
	left := renderColumnDiv(fmt.Sprintf("s%d-l0", pageNum), cols[0], colW, bodyH, fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 10+pageNum*4)
	left += renderColumnDiv(fmt.Sprintf("s%d-l1", pageNum), cols[1], colW, bodyH, fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 11+pageNum*4)
	right := renderColumnDiv(fmt.Sprintf("s%d-r0", pageNum), cols[2], colW, bodyH, fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 12+pageNum*4)
	right += renderColumnDiv(fmt.Sprintf("s%d-r1", pageNum), cols[3], colW, bodyH, fs, lh, paraSep, cfg.IdeaHeadingBottomMarginMM, 13+pageNum*4)
	_ = heights
	return fmt.Sprintf(`
<div class="sheet sheet-overflow" id="sheet%d" data-sheet-index="%d" style="--mid-gap:%.4fmm;--col-gap:%.4fmm">
  <div class="sheet-inner sheet2-grid" style="padding:%.4fmm %.4fmm">
    <div class="block left sheet2-left"><div class="zone-body">%s</div></div>
    <div class="gutter"></div>
    <div class="block right sheet2-right"><div class="zone-body">%s</div></div>
  </div>
</div>`, pageNum, pageNum, cfg.MidSeparationMM, cfg.ColumnGapMM, cfg.MarginVerticalMM, cfg.MarginLateralMM, left, right)
}
