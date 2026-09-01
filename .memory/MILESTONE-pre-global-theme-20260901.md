# Milestone — pre-global-theme checkpoint (2026-09-01)

Safety snapshot **before** the site-wide Calibri/14px/`--m*`/`--p*`/`--bg`/`--fg` redesign, product dashboards (Music / eVoice / Pamphlet), and eVoice crawl pipeline.

## State frozen here

- eVoice (044): File Uploads, Docs|Playlist, stale-key fix, icon regenerate / Generate selected / playlist transport icons
- Header chrome: logo + hamburger share a visible 1px border; phone **home** hides empty dynamic slot so bar matches other routes (`space-between`)
- Pamphlet + Scrib: locked mm/px layouts — **must not** be converted to rem/root-14 in the upcoming theme (pass-through in spec)
- eReport API live (`/api/ereport/library` → 401 without JWT); pages 200

## Do not start from this commit for

- Global token rename (`--m1`…`--br`, `--bg`/`--fg`, button ISO colors, no borders)
- Music / eVoice / Pamphlet dashboard card shells + header dynamic buttons
- eVoice crawl → cleaner → DeepSeek HTML → render

Those land in a **new** feature spec after this push.

Git: commit on `master` immediately after this file.
