/**
 * Public marketing profile facts for the home dossier + JSON-LD.
 * Keep aligned with backend/internal/contact/PROFILE_CONTEXT.md §2 (no invention).
 * Visible dossier copy is first person; FAQ questions stay natural-language for AEO.
 * Privacy: do not volunteer birth date; residence only as Venezuela if needed.
 */

export const PROFILE_LINKEDIN = "https://www.linkedin.com/in/eduardoosteicoechea";
export const PROFILE_EMAIL = "eduardooost@gmail.com";
export const PROFILE_WHATSAPP = "https://wa.me/584147281033";
export const PROFILE_WHATSAPP_DISPLAY = "+58 414 728 1033";
export const PROFILE_SITE = "https://eduardoos.com";
export const PROFILE_YOUTUBE = "https://youtube.com/@EduardoOsteicoechea";
export const PROFILE_GITHUB = "https://github.com/EduardoOsteicoechea";

export const profileWhoAnswer =
  "I am a licensed Building Architect (Universidad de Los Andes, Cum Laude), a Master in BIM, and a full-stack developer across desktop, web, and cloud. I build Revit and AutoCAD API tools, ship AI integrations, and design multiplatform products — so AEC teams get architecture depth and software delivery from one practice. I am especially energized by AI-driven development: turning model intelligence into tools people can actually run.";

export const profileExpertiseAnswer =
  "I specialize in Revit and AutoCAD API tooling, custom Revit add-ins and Dynamo workflows, .NET desktop apps, and full-stack web and cloud delivery. My work connects design technology with AI — clash detection, visualization, quantification, and multiplatform BIM products that learn from how teams actually build.";

export type ProfileExperience = {
  org: string;
  role: string;
  period: string;
  summary: string;
};

export const profileExperience: ProfileExperience[] = [
  {
    org: "Avant Leap",
    role: "BIM software developer",
    period: "March 2024–present",
    summary:
      "I support and extend Revit add-ins (Clash Detection, Object Visualizer, Object Quantifier, 4D Simulation, Dynamo Zero Touch Nodes, Mirar, Andiamo, Itera). I built SincronizadorGPS50 (Windows Forms + SQL Server) linking Gestproject2024 and Sage50, and ship AI integrations with OpenAI, StabilityAI, and Replicate-based actions across Windows apps and Revit APIs.",
  },
  {
    org: "Freelance",
    role: "Full-stack web & UI/UX",
    period: "Late 2023 (~six months)",
    summary:
      "I delivered sites including scalaa.com, theinspiratagroup.com, hotelbelensate.com, eduardoos.com, crintt.com, and thedalessiogroup.com — branding, design, coding, hosting, email migration, and media production.",
  },
  {
    org: "BIMIQs (Miami)",
    role: "BIM modeler, Revit API developer, web developer",
    period: "2023",
    summary:
      "As the first employee of a US AEC consulting startup, I covered BIM modeling, Revit families, Revit API tools (including Revit Modeler), and graphic design for bimiqs.com — modeling, research, API, and full-stack web in one role.",
  },
  {
    org: "VDC Works (Miami)",
    role: "Revit BIM technician",
    period: "2023",
    summary:
      "I documented electrical rooms and assemblies with collaborative BIM workflows and began visual programming with Revit Dynamo and Python.",
  },
  {
    org: "Iglesia Palabra Viva",
    role: "Venezuelan missionary",
    period: "Until ~2023",
    summary:
      "Leadership, teaching, public speaking, and counseling; parallel theology study at Integridad & Sabiduría; I began writing and song creation.",
  },
  {
    org: "Galpon5",
    role: "Architectural project assistant",
    period: "2017–2018",
    summary:
      "I modeled, documented, and rendered buildings in AutoCAD, SketchUp, V-Ray, and 3ds Max for hospitality and commercial projects including Lindo Sol Suites Hotel and Lindo Bakery.",
  },
];

export const profileEducation: string[] = [
  "Bachelor of Architecture, Universidad de Los Andes (ULA), 2009–2017; graduated 2017 (Cum Laude). Architectural design, AutoCAD, SketchUp; BIM training at an Autodesk Authorized Training Center.",
  "Advanced BIM Modeling Course, BIMMASTER.org.",
  "Master in BIM, Aitec.",
  "Theology studies, Integridad & Sabiduría (online institute, Dominican Republic), through ~2023.",
  "Full-stack web development self-study (2020–2023): HTML, CSS, JavaScript, Bootstrap, PHP, MySQL, and modern front-end practice.",
];

export type ProfileSkill = {
  title: string;
  description: string;
};

/** Six featured skills for the home skills grid (brief, CV-grounded). */
export const profileSkillCards: ProfileSkill[] = [
  {
    title: "Revit add-ins & API",
    description:
      "Custom commands, families, and .NET tools that sit inside real BIM workflows.",
  },
  {
    title: "AI in BIM",
    description:
      "OpenAI, StabilityAI, and Replicate wired into clash, visualize, and automate loops.",
  },
  {
    title: "AI-driven products",
    description:
      "I ship multiplatform tools where model intelligence becomes something teams can run.",
  },
  {
    title: "Full-stack delivery",
    description:
      "Desktop (.NET/WPF), web (React/TS), and cloud (AWS/Nginx) from one practice.",
  },
  {
    title: "Cloud & DevOps",
    description:
      "AWS hosting, CI/CD, and durable object storage under production prefixes.",
  },
  {
    title: "Cross-discipline AEC",
    description:
      "Architecture depth plus software delivery — one professional who models and ships.",
  },
];

export const profileSkills: string[] = profileSkillCards.map((s) => s.title);

export const profileStack =
  ".NET, C#, WPF, Windows Forms, Blazor / Blazor Hybrid, .NET MAUI, Python, PHP, JavaScript, TypeScript, HTML, CSS, React, MySQL, SQLite, SQL Server, Git/GitHub, AutoCAD, Revit, Dynamo, SketchUp, Linux, Nginx, AWS, and AI tooling including StabilityAI and DeepSeek.";

export const profileFocusAnswer =
  "I am building full-stack applications (React and .NET minimal APIs where relevant), GitHub CI/CD toward AWS, and AI API integrations aimed at multiplatform AI-powered BIM products for AEC. I operate eduardoos.com as my professional platform for documents, articles, music, church, and homescool tooling — and I keep pushing AI-driven development into every product surface that benefits from it.";

export type ProfileFaq = { question: string; answer: string };

export const profileFaq: ProfileFaq[] = [
  {
    question: "Who is Eduardo Osteicoechea?",
    answer: profileWhoAnswer,
  },
  {
    question: "What is Eduardo OS?",
    answer:
      "Eduardo OS is my professional platform at eduardoos.com — services and tools spanning pamphlet documents, articles, music, church, and homescool, alongside my practice in BIM and full-stack software with a strong focus on AI-driven development.",
  },
  {
    question: "How can I contact Eduardo Osteicoechea?",
    answer:
      "Email eduardooost@gmail.com, WhatsApp +58 414 728 1033 (https://wa.me/584147281033), or LinkedIn https://www.linkedin.com/in/eduardoosteicoechea. GitHub and YouTube profiles are also public on this site.",
  },
  {
    question: "Where does Eduardo Osteicoechea live?",
    answer:
      "I currently reside in Venezuela. For further information, contact me by email, WhatsApp, or LinkedIn using the public channels listed on this page.",
  },
];

/** JSON-LD @graph for the home page (Person + WebPage + FAQPage). */
export function buildHomeProfileJsonLd(pageUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: "Eduardo Osteicoechea — Architect, BIM engineer, software builder",
        description: profileWhoAnswer,
        isPartOf: { "@id": `${PROFILE_SITE}/#website` },
        about: { "@id": `${pageUrl}#person` },
        primaryImageOfPage: {
          "@type": "ImageObject",
          url: `${PROFILE_SITE}/personal_photo_1080x1920_side_placed.webp`,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${PROFILE_SITE}/#website`,
        url: PROFILE_SITE,
        name: "Eduardo OS",
        publisher: { "@id": `${pageUrl}#person` },
      },
      {
        "@type": "Person",
        "@id": `${pageUrl}#person`,
        name: "Eduardo Osteicoechea",
        url: PROFILE_SITE,
        image: `${PROFILE_SITE}/personal_photo_1080x1920_side_placed.webp`,
        jobTitle: "Architect, BIM engineer, and full-stack software developer",
        description: profileWhoAnswer,
        email: PROFILE_EMAIL,
        sameAs: [PROFILE_LINKEDIN, PROFILE_GITHUB, PROFILE_YOUTUBE, PROFILE_SITE],
        knowsAbout: [
          "Building Information Modeling",
          "Revit API",
          "Architecture",
          "Full-stack software development",
          "AI-driven development",
          "AI integrations for AEC",
        ],
        alumniOf: {
          "@type": "CollegeOrUniversity",
          name: "Universidad de Los Andes",
        },
        worksFor: {
          "@type": "Organization",
          name: "Avant Leap",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: profileFaq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };
}
