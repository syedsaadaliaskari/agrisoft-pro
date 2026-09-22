/** Free WhatsApp templates for Super Admin → activated companies. */
export type VendorMsgLang = "en" | "ur";

export type VendorMessageTemplate = {
  id: string;
  lang: VendorMsgLang;
  name: string;
  body: string;
};

export const VENDOR_MESSAGE_TEMPLATES: VendorMessageTemplate[] = [
  {
    id: "renewal_en",
    lang: "en",
    name: "Plan ending / renew",
    body: "Assalam o Alaikum {name},\nYour Agri Soft Pro {plan} plan ends on {expires}. Please renew to keep using the software.",
  },
  {
    id: "expired_en",
    lang: "en",
    name: "Plan ended",
    body: "Assalam o Alaikum {name},\nYour Agri Soft Pro {plan} plan ended on {expires}. Renew to restore access.",
  },
  {
    id: "active_en",
    lang: "en",
    name: "Active plan reminder",
    body: "Assalam o Alaikum {name},\nYour Agri Soft Pro {plan} is active until {expires}. Thank you.",
  },
  {
    id: "renewal_ur",
    lang: "ur",
    name: "پلان ختم / تجدید",
    body: "السلام علیکم {name}،\nآپ کا Agri Soft Pro {plan} پلان {expires} کو ختم ہو رہا ہے۔ سافٹ ویئر چلتا رکھنے کے لیے تجدید کروا لیں۔",
  },
  {
    id: "expired_ur",
    lang: "ur",
    name: "پلان ختم ہو چکا",
    body: "السلام علیکم {name}،\nآپ کا Agri Soft Pro {plan} پلان {expires} کو ختم ہو چکا ہے۔ رسائی کے لیے تجدید کروا لیں۔",
  },
  {
    id: "active_ur",
    lang: "ur",
    name: "فعال پلان",
    body: "السلام علیکم {name}،\nآپ کا Agri Soft Pro {plan} {expires} تک فعال ہے۔ شکریہ۔",
  },
];

/** Pakistan mobiles: 03xx… → 923xx…  Already 92… stays. */
export function whatsappDigits(raw: string | null | undefined): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = `92${d.slice(1)}`;
  if (d.length === 10 && d.startsWith("3")) d = `92${d}`;
  return d;
}

export function fillVendorMessage(
  template: string,
  vars: { name: string; plan: string; expires: string }
): string {
  return template
    .replaceAll("{name}", vars.name)
    .replaceAll("{plan}", vars.plan)
    .replaceAll("{expires}", vars.expires);
}

export function vendorWhatsAppUrl(phone: string, text: string): string {
  const digits = whatsappDigits(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
