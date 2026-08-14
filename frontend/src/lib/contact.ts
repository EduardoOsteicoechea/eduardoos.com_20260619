/** Public contact constants and chat action helpers for home /contact agents. */

export const CONTACT_OWNER_EMAIL = "eduardooost@gmail.com";
/** wa.me requires digits only (country code + number), no "+" or spaces. */
export const CONTACT_WHATSAPP_E164 = "584147281033";
export const CONTACT_WHATSAPP_URL = `https://wa.me/${CONTACT_WHATSAPP_E164}`;

export type ContactAction = {
  type: "email_notify" | "whatsapp" | string;
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
  whatsappUrl?: string;
};

export type ProfileAskResponse = {
  answer?: string;
  actions?: ContactAction[];
  whatsappUrl?: string;
  ownerEmail?: string;
};

/** Open WhatsApp chat with Eduardo in a new tab (correct wa.me link). */
export function openWhatsAppChat(url = CONTACT_WHATSAPP_URL): void {
  const href = (url || CONTACT_WHATSAPP_URL).trim() || CONTACT_WHATSAPP_URL;
  window.open(href, "_blank", "noopener,noreferrer");
}

/** Run side-effects for actions returned by /api/profile/ask or /api/contact/ask. */
export function applyContactActions(actions: ContactAction[] | undefined): void {
  if (!actions?.length) return;
  for (const action of actions) {
    if (action.type === "whatsapp") {
      openWhatsAppChat(action.whatsappUrl || CONTACT_WHATSAPP_URL);
    }
  }
}

export function humanTokenFor(scope: string, heldMs: number): string {
  const bucket = Math.floor(heldMs / 1000);
  return `ok:${scope}:${bucket}`;
}
