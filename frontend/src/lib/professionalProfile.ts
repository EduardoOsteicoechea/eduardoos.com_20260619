/**
 * Canonical professional profile text for the public home skill chat (DeepSeek context).
 * Keep this in sync with the home hero copy and real CV highlights.
 */
export const PROFESSIONAL_PROFILE = `
Name: Eduardo Osteicoechea
Title: AEC Technologist

Summary:
Licensed Building Architect, BIM Practitioner, Full Stack BIM–Desktop–Web–Cloud Software Developer,
AI Integrationist, English proficient and Spanish native, research enthusiast, and interdisciplinary
professional focused on full-stack AEC solutions, cloud applications, AI integration, BIM collaboration,
and practical problem solving.

Core skills:
- Licensed Building Architect
- BIM Practitioner
- Full Stack Software Developer
- BIM Software Developer
- Desktop Software Developer
- Web Software Developer
- Cloud Software Developer
- AI Integrationist
- English proficient and Spanish native
- Research enthusiast
- Interdisciplinary problem solving

Focus areas:
Architecture and construction technology, Building Information Modeling (BIM), software engineering across
desktop/web/cloud, and integrating AI into AEC workflows and products.
`.trim();

export type SkillId =
  | "architect"
  | "bim-practitioner"
  | "fullstack"
  | "bim-dev"
  | "desktop-dev"
  | "web-dev"
  | "cloud-dev"
  | "ai"
  | "languages"
  | "research"
  | "problem-solving";

export interface HomeSkill {
  id: SkillId;
  label: string;
  /** S3-relative folder under media/ for portfolio media (images + videos). */
  mediaPrefix: string;
  blurb: string;
}

export const HOME_SKILLS: HomeSkill[] = [
  {
    id: "architect",
    label: "Licensed Building Architect",
    mediaPrefix: "skills/architect",
    blurb: "Licensed practice across building design, documentation, and AEC delivery.",
  },
  {
    id: "bim-practitioner",
    label: "BIM Practitioner",
    mediaPrefix: "skills/bim-practitioner",
    blurb: "Hands-on BIM coordination, modeling standards, and collaborative delivery.",
  },
  {
    id: "fullstack",
    label: "Full Stack Software Developer",
    mediaPrefix: "skills/fullstack",
    blurb: "End-to-end product engineering across UI, APIs, data, and deployment.",
  },
  {
    id: "bim-dev",
    label: "BIM Software Developer",
    mediaPrefix: "skills/bim-dev",
    blurb: "Custom BIM tools, automation, and integrations for design/construction teams.",
  },
  {
    id: "desktop-dev",
    label: "Desktop Software Developer",
    mediaPrefix: "skills/desktop-dev",
    blurb: "Native and cross-platform desktop applications for professional workflows.",
  },
  {
    id: "web-dev",
    label: "Web Software Developer",
    mediaPrefix: "skills/web-dev",
    blurb: "Modern web apps, APIs, and responsive product surfaces.",
  },
  {
    id: "cloud-dev",
    label: "Cloud Software Developer",
    mediaPrefix: "skills/cloud-dev",
    blurb: "Cloud-native services, storage, CI/CD, and production operations.",
  },
  {
    id: "ai",
    label: "AI Integrationist",
    mediaPrefix: "skills/ai",
    blurb: "Practical AI integration into products, assistants, and AEC tooling.",
  },
  {
    id: "languages",
    label: "English proficient and Spanish native",
    mediaPrefix: "skills/languages",
    blurb: "Bilingual communication for international teams and clients.",
  },
  {
    id: "research",
    label: "Research enthusiast",
    mediaPrefix: "skills/research",
    blurb: "Continuous learning, experimentation, and evidence-driven improvement.",
  },
  {
    id: "problem-solving",
    label: "Interdisciplinary problem solving",
    mediaPrefix: "skills/problem-solving",
    blurb: "Crossing architecture, software, and AI to solve real delivery problems.",
  },
];
