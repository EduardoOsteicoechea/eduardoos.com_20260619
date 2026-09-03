# PROMPT-SDK — eReport (site + API)

**Preferred:** install the downloadable Cursor skill, then invoke it.

| File | URL |
|------|-----|
| Skill | https://eduardoos.com/skills/eduardoos-ereport/SKILL.md |
| Caveats (downloaders) | https://eduardoos.com/skills/eduardoos-ereport/CAVEATS.md |
| Reference | https://eduardoos.com/skills/eduardoos-ereport/reference.md |

Install into `.cursor/skills/eduardoos-ereport/`. Product page: `/api-docs`.

Audience: (1) non-technical operators (2) coding agents.

Tool (optional): `ereport_client.py` + `.env` in this folder.

Choose **one mode** at a time (full detail in the skill):

| Mode | Purpose |
|------|---------|
| **A** | Open & edit on the website |
| **B** | Sync via API (`get` → edit → `put`) |
| **C** | Ingest a complaints document → open issues → `put` |

If the report is **not** open on the site: Mode A first, then B or C.

## Copy-paste prompt (skill-first)

```
Install and follow the Eduardo OS skill eduardoos-ereport:
  https://eduardoos.com/skills/eduardoos-ereport/
Read CAVEATS.md first. Then: <USER TASK HERE>
End with Ver reporte: <viewUrl>
```

## Quick Mode B CLI (this repo)

```bash
cd scripts/eduardoos-ereport
copy .env.example .env
python ereport_client.py access
python ereport_client.py orgs
python ereport_client.py org-reports
python ereport_client.py get
python ereport_client.py put --file report.payload.json
```

Never commit `.env`. See prompts/01 (dates) and prompts/02 (viewUrl) for escalation notes.
