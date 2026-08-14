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
    title: "Artículos",
    blurb: "Panfletos publicados en lectura continua, con quiz y preguntas al margen.",
    href: APP_ROUTES.articles,
  },
  {
    id: "pamphlet",
    title: "Editor Panfleto",
    blurb: "Crea y guarda material educativo en formato panfleto para luego leerlo como artículo.",
    href: APP_ROUTES.pamphlet,
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    blurb: "Escríbeme directo si necesitas orientación rápida sobre Homescool.",
    href: CONTACT_WHATSAPP_URL,
    external: true,
  },
  {
    id: "email",
    title: "Correo",
    blurb: "Envíame un mensaje a mi correo personal y te respondo con información.",
    href: `mailto:${CONTACT_OWNER_EMAIL}?subject=${encodeURIComponent("Homescool — información")}`,
    external: true,
  },
  {
    id: "contact",
    title: "Contacto",
    blurb: "Página de contacto con agente, correo y WhatsApp en un solo lugar.",
    href: APP_ROUTES.contact,
  },
  {
    id: "subscription",
    title: "Suscripción",
    blurb: "Revisa planes si quieres servicios recurrentes junto al material Homescool.",
    href: APP_ROUTES.subscription,
  },
];
