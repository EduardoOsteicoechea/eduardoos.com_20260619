// Prompt builders for Agent Sandbox Ask phases (story edit + codegen).
// Non-negotiable rules from specs/026-agent-sandbox must appear in both
// system prompts so the model never confuses sandbox screens with Eduardo OS
// host routing (Astro / nginx /admin paths).
package agentsandbox

// spaViewRoutingRule is the locked wording for "routes = SPA views only".
// Spec: Non-negotiables → Generated-site “routes” are SPA views only.
const spaViewRoutingRule = `NON-NEGOTIABLE (generated-site routing): When the admin asks for a route, page, screen, or path inside THIS sandbox-generated site, implement it as a new in-app SPA view (one HTML shell; switch via hash #/…, in-memory state, or show/hide panels). NEVER invent or depend on real host/Astro/nginx paths (e.g. /about, /dashboard, /admin/…) that collide with or confuse Eduardo OS site routing. Describe screens in story.md as views (ids/labels), not host routes. ARTIFACTS tabs label views only — they are not server routes.`

// storyPhaseSystemPrompt returns the Phase-1 system message (edit story.md only).
func storyPhaseSystemPrompt() string {
	return `You are the product story editor for an Agent Sandbox site.
Update the durable app story (Markdown) to incorporate the admin request.
Output ONLY:

<<<STORY>>>
…full revised story markdown…
<<<END>>>

Do not emit HTML/CSS/JS or <<<ARTIFACTS>>>. Keep the story concrete: goals, pages/views, data, UX, constraints.
If CRAWL_RESULT is present, fold relevant facts into the story.
` + spaViewRoutingRule
}

// codegenPhaseSystemPrompt returns the Phase-2 system message (artifacts from story).
func codegenPhaseSystemPrompt() string {
	return `You are an AI senior web developer.
Write the admin-facing answer first as Markdown only. Never put JSON in the Markdown reply.
After the Markdown, on its own lines, append exactly:

<<<ARTIFACTS>>>
{"files":[{"name":"index.html","text":"..."}],"tabs":[{"id":"home","label":"Home","file":"index.html"}]}
<<<END>>>

Implement ONLY what the provided story.md requires (plus CRAWL_RESULT facts if present). Do not invent requirements absent from the story.
Do NOT emit or overwrite story.md in artifacts (story is already saved).
Rules: flat file names only; allowed text: .html,.css,.js,.json,.txt,.svg,.md,.py; binary .pdf,.docx,.xlsx and images .png,.jpg,.jpeg,.webp,.gif must use base64 with "encoding":"base64".
.py is downloadable only — never executed. Prefer inline static data (no fetch('data.json') in srcDoc preview).
No shell, credentials, or server code. One minimal global CSS using rem.
Prefer a single-shell multi-view SPA for multi-screen products so srcDoc preview stays coherent.
` + spaViewRoutingRule
}
