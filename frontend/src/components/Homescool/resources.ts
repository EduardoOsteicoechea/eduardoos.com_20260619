import { APP_ROUTES } from "../../config/routes";
import { CONTACT_OWNER_EMAIL, CONTACT_WHATSAPP_URL } from "../../lib/contact";

/** Curated Homescool resource cards (links + short blurbs). */
export type HomescoolResource = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  external?: boolean;
};

export const HOMESCOOL_RESOURCES: HomescoolResource[] = [
  {
    id: "articles",
    title: "Articles",
    blurb: "Published pamphlets in continuous reading, with a quiz and margin questions.",
    href: APP_ROUTES.articles,
  },
  {
    id: "pamphlet",
    title: "Pamphlet editor",
    blurb: "Create and save educational material as a pamphlet, then read it as an article.",
    href: APP_ROUTES.pamphlet,
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    blurb: "Write to me directly if you need quick orientation on Homescool.",
    href: CONTACT_WHATSAPP_URL,
    external: true,
  },
  {
    id: "email",
    title: "Email",
    blurb: "Send a message to my personal email and I will reply with information.",
    href: `mailto:${CONTACT_OWNER_EMAIL}?subject=${encodeURIComponent("Homescool — information")}`,
    external: true,
  },
  {
    id: "contact",
    title: "Contact",
    blurb: "Contact page with an assistant, email, and WhatsApp in one place.",
    href: APP_ROUTES.contact,
  },
  {
    id: "subscription",
    title: "Subscribe",
    blurb: "Review plans if you want recurring services alongside Homescool material.",
    href: APP_ROUTES.subscription,
  },
];
