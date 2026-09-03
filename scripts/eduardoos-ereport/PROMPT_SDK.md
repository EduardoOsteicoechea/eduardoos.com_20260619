# PROMPT-SDK — points at `.ereport` connector

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
| Product docs | https://eduardoos.com/api-docs |

## Copy-paste

```
Install Eduardo OS connector as .ereport/ (sidecar), read CAVEATS, invoke skill eduardoos-ereport.
Task: <USER TASK>
End with Ver reporte: <viewUrl>
```
