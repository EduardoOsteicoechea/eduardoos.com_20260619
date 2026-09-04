# PROMPT-SDK — points at `.ereport` connector (docs-first)

**Preferred install** (host repo stays clean):

```bash
git clone --depth 1 https://github.com/EduardoOsteicoechea/eduardoos-ereport-connector.git .ereport
```

Wire skill: `.ereport/skill/eduardoos-ereport/` → `.cursor/skills/eduardoos-ereport/`  
(or run `install.ps1` / `install.sh` from the connector).

| Resource | URL |
|----------|-----|
| Connector | https://github.com/EduardoOsteicoechea/eduardoos-ereport-connector |
| Caveats | `.ereport/skill/eduardoos-ereport/CAVEATS.md` |
| Live catalog | `GET https://eduardoos.com/api/v1/docs` |
| Product docs | https://eduardoos.com/api-docs |

## Copy-paste

```
Install Eduardo OS connector as .ereport/ (sidecar), set EDUARDOOS_API_KEY,
run: python .ereport/ereport_client.py docs
Read CAVEATS + catalog.payloadSchema, invoke skill eduardoos-ereport.
Task: <USER TASK>
End with Ver reporte: <viewUrl>
```
