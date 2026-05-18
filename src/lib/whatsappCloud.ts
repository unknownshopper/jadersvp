type WhatsAppTemplateBodyParam = { type: "text"; text: string };

type WhatsAppTemplateHeaderImageParam = { type: "image"; image: { link: string } };

type WhatsAppTemplateComponent = {
  type: "body";
  parameters: WhatsAppTemplateBodyParam[];
};

type WhatsAppTemplateHeaderComponent = {
  type: "header";
  parameters: WhatsAppTemplateHeaderImageParam[];
};

type WhatsAppTemplateMessage = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<WhatsAppTemplateHeaderComponent | WhatsAppTemplateComponent>;
  };
};

function cleanDigits(s: string) {
  return String(s || "")
    .trim()
    .replace(/[^0-9]/g, "");
}

export function toE164(inputPhone: string): string | null {
  const raw = String(inputPhone ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("+")) {
    const digits = cleanDigits(raw);
    if (!digits) return null;

    // WhatsApp Mexico mobile handling:
    // If stored as +52 + 10 digits, send as +521 + 10 digits.
    if (digits.startsWith("52") && digits.length === 12 && !digits.startsWith("521")) {
      return `+521${digits.slice(2)}`;
    }

    return `+${digits}`;
  }

  const digits = cleanDigits(raw);
  if (!digits) return null;

  if (digits.length === 10) return `+52${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+52${digits}`;
  if (digits.length === 12 && digits.startsWith("52")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("521")) return `+${digits}`;

  if (digits.length >= 8) return `+${digits}`;
  return null;
}

function getEnv(name: string): string | null {
  const v = process.env[name];
  return v ? String(v).trim() : null;
}

export function isWhatsAppConfigured() {
  const token = getEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = getEnv("WHATSAPP_PHONE_NUMBER_ID");
  return Boolean(token && phoneNumberId);
}

export async function sendWhatsAppTemplate(params: {
  toPhone: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerImageUrl?: string | null;
}): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }> {
  const token = getEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = getEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return { ok: false, error: "WHATSAPP_NOT_CONFIGURED" };

  const to = toE164(params.toPhone);
  if (!to) return { ok: false, error: "INVALID_PHONE" };

  const languageCode = params.languageCode ?? getEnv("WHATSAPP_TEMPLATE_LANGUAGE") ?? "es_MX";

  const bodyParams = (params.bodyParams ?? [])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
    .slice(0, 10);

  const headerLink = String(params.headerImageUrl ?? "").trim();

  const components: Array<WhatsAppTemplateHeaderComponent | WhatsAppTemplateComponent> = [];
  if (headerLink) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: headerLink } }]
    });
  }

  if (bodyParams.length) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text }))
    });
  }

  const payload: WhatsAppTemplateMessage = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: params.templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {})
    }
  };

  const url = `https://graph.facebook.com/v25.0/${encodeURIComponent(phoneNumberId)}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  if (!res.ok) return { ok: false, error: text || `HTTP_${res.status}` };

  try {
    const json = JSON.parse(text);
    const messageId = Array.isArray(json?.messages) && json.messages[0]?.id ? String(json.messages[0].id) : null;
    return { ok: true, messageId };
  } catch {
    return { ok: true, messageId: null };
  }
}
