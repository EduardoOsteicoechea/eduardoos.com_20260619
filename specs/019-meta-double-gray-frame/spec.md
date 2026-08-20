# Feature 019 — Meta section double gray dividers (not outer frame)

## Goals

1. **Remove** the outer double gray frame around `.pamphlet-header-meta-bar` / `.pamphlet-footer-meta-bar`.
2. **Header:** only a **cross** of double gray rules — vertical through the column gap + horizontal through the row gap (orange sketch lines). Do not change header band height.
3. **Footer:** same cross **plus** a double gray rule along the **top** of the meta grid (orange sketch). Do not change footer band height.
4. PDF paints the same overlays (no layout math change).

## Acceptance

- [x] No outer meta frame; header cross only; footer top + cross; tests/build green.
