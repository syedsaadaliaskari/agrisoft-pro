/** Vendor support contacts — edit these before shipping client builds. */
export const VENDOR_SUPPORT = {
  /** WhatsApp number in international form, digits only (no +). */
  whatsappE164: "923168762618",
  /** Shown on Activate Pro screen */
  whatsappDisplay: "+92 316 8762618",
  label: "WhatsApp vendor",
};

/** Opens WhatsApp with Install ID pre-filled for activation. */
export function whatsappActivationUrl(installId: string): string {
  const text = [
    "Hello, I need Agri Soft Pro activation.",
    `Install ID: ${installId}`,
    "Plan: (Monthly / Yearly / Forever)",
  ].join("\n");
  return `https://wa.me/${VENDOR_SUPPORT.whatsappE164}?text=${encodeURIComponent(text)}`;
}
