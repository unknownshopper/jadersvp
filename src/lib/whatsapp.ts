export function buildWhatsAppUrl(phone: string, message: string) {
  const clean = phone.replace(/[^0-9]/g, "");
  const text = encodeURIComponent(message);
  return `https://wa.me/${clean}?text=${text}`;
}
