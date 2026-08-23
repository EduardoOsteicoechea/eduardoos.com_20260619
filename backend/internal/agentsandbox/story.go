// Story helpers: canonical app memory is flat site file story.md;
// Site.Spec mirrors its body for prompt compatibility.
package agentsandbox

import "strings"

const (
	storyFileName = "story.md"
	storyStart    = "<<<STORY>>>"
	storyEnd      = "<<<END>>>"
)

// siteStoryText returns story.md text, falling back to Site.Spec.
func siteStoryText(site Site) string {
	for _, f := range site.Files {
		if strings.EqualFold(f.Name, storyFileName) {
			return f.Text
		}
	}
	return site.Spec
}

// applyStoryToSite upserts story.md and mirrors Site.Spec.
func applyStoryToSite(site *Site, story string) error {
	story = strings.TrimSpace(story)
	if story == "" {
		return nil
	}
	site.Spec = story
	return upsertSiteFile(site, File{
		Name: storyFileName,
		Type: "text/markdown",
		Text: story,
	})
}

// splitStory extracts markdown between <<<STORY>>> and <<<END>>>.
// If markers are missing, the whole trimmed payload is treated as the story.
func splitStory(raw string) string {
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, storyStart)
	if start < 0 {
		// Model sometimes omits markers — accept whole reply as story.
		return raw
	}
	rest := raw[start+len(storyStart):]
	end := strings.Index(rest, storyEnd)
	if end >= 0 {
		rest = rest[:end]
	}
	return strings.TrimSpace(rest)
}
