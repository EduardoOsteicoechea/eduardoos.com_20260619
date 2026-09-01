# Milestone — Global theme + product dashboards (2026-09-01)

Feature 045 shipped from checkpoint `6cdd174`.

- Root `14px × --site-text-scale`; Calibri / system-ui
- Tokens `--m1…m5`, `--p1…p5`, `--bmh`/`--bmw`, `--lbw`, `--br`, `--bg`/`--fg`, ISO button colors; phone/tablet/desktop lists
- No borders site-wide (aliases keep `--site-*`)
- Pamphlet mm/px + Scrib pass-through
- Music / eVoice / Pamphlet dashboards with `?view=` + header dynamic short labels
- Music Upload: new song + existing→v2
- eVoice crawl: validate URL → strip → DeepSeek TTS clean → save `docs/crawl-*.txt`

Spec: `specs/045-global-theme-product-dashboards/spec.md`
