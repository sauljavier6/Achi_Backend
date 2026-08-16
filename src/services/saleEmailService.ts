import nodemailer from "nodemailer";
import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import Address from "../models/Adress";
import Email from "../models/Email";
import EmailDelivery from "../models/EmailDelivery";
import Sale from "../models/Sale";
import User from "../models/User";
import { formatPublicFolio } from "../utils/publicFolio";

type EmailKind = "purchase" | "ticket" | "quote";
type ProductRow = { Quantity: number; Description: string | null; Saleprice: number | null };
const BRAND = { name: "Achi Veterinaria", primary: "#b60059", secondary: "#0b677a", background: "#f9f9fc" };

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}`);
  return value;
}

const money = (value: number | string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value));
const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#039;");

function smtpTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host: env("SMTP_HOST"), port, secure: port === 465,
    auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") },
  });
}

function renderEmail(input: { kind: EmailKind; sale: Sale; products: ProductRow[]; address?: string | null }) {
  const publicFolio = formatPublicFolio(input.sale, input.kind === "quote" ? "quote" : input.kind === "purchase" ? "order" : "sale");
  const isCredit = input.sale.Pagada === "Pendiente" && Number(input.sale.Balance_Total) > 0;
  const labels = {
    purchase: { eyebrow: "Pago confirmado", title: "¡Gracias por tu compra!", intro: "Tu pago fue acreditado y comenzaremos a preparar tu pedido." },
    ticket: isCredit
      ? { eyebrow: "Venta a crédito", title: "Comprobante de venta a crédito", intro: "Aquí tienes el resumen de tu compra y el saldo que permanece pendiente." }
      : { eyebrow: "Comprobante", title: "Ticket de compra", intro: "Aquí tienes el resumen de tu compra." },
    quote: { eyebrow: "Cotización", title: "Tu cotización", intro: "Preparamos este resumen para ti. La cotización tiene una vigencia de 7 días." },
  }[input.kind];
  const rows = input.products.map((product) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eadde2">${escapeHtml(product.Description || "Producto")} × ${product.Quantity}</td><td style="padding:12px 0;border-bottom:1px solid #eadde2;text-align:right">${money(Number(product.Saleprice) * product.Quantity)}</td></tr>`).join("");
  const creditNotice = isCredit ? `<div style="margin-top:18px;padding:16px 18px;border-radius:14px;background:#fff7df;border:1px solid #f5cf69"><strong>Saldo pendiente: ${money(input.sale.Balance_Total)}</strong><br><span style="font-size:13px;color:#6d5716">Este comprobante no acredita la liquidación del adeudo.</span></div>` : "";
  return `<!doctype html><html><body style="margin:0;background:${BRAND.background};font-family:Arial,sans-serif;color:#1a1c1e"><div style="display:none;max-height:0;overflow:hidden">${labels.intro}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 8px 28px rgba(91,63,70,.12)"><tr><td style="padding:28px 32px;background:${BRAND.primary};color:#fff"><div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${labels.eyebrow}</div><div style="font-size:28px;font-weight:800;margin-top:8px">${BRAND.name}</div></td></tr><tr><td style="padding:32px"><h1 style="font-size:25px;margin:0 0 12px;color:${BRAND.primary}">${labels.title}</h1><p style="font-size:16px;line-height:1.6;margin:0 0 24px;color:#5b3f46">${labels.intro}</p><div style="padding:16px 18px;border-radius:14px;background:#fff1f5;border:1px solid #ffd1df"><strong>Folio ${publicFolio}</strong><br><span style="color:#5b3f46">${new Date(input.sale.createdAt).toLocaleString("es-MX", { timeZone: "America/Tijuana" })}</span></div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px">${rows}</table>${input.address ? `<p style="margin:22px 0 0"><strong>Entrega:</strong><br>${escapeHtml(input.address)}</p>` : ""}<table role="presentation" width="100%" style="margin-top:24px;background:#f3f3f6;border-radius:14px;padding:16px"><tr><td>Subtotal</td><td align="right">${money(input.sale.Subtotal)}</td></tr><tr><td>IVA</td><td align="right">${money(input.sale.Iva)}</td></tr><tr><td>Envío</td><td align="right">${money(input.sale.Envio ?? 0)}</td></tr><tr><td style="padding-top:10px;font-size:19px;font-weight:800;color:${BRAND.primary}">Total</td><td align="right" style="padding-top:10px;font-size:19px;font-weight:800;color:${BRAND.primary}">${money(input.sale.Total)}</td></tr></table>${creditNotice}<p style="margin:26px 0 0;text-align:center;color:${BRAND.secondary};font-weight:700">Cuidamos a quienes forman parte de tu familia.</p></td></tr></table></td></tr></table></body></html>`;
}

export async function sendSaleEmail(saleId: number, kind: EmailKind, eventKey?: string) {
  const sale = await Sale.findByPk(saleId);
  if (!sale) throw new Error("Venta no encontrada");
  const user = await User.findByPk(sale.ID_User);
  const email = await Email.findByPk(user?.ID_Email);
  const recipient = email?.Description?.trim();
  if (!recipient) throw new Error("La venta no tiene correo de destinatario");

  const key = eventKey ?? `${kind}:${saleId}`;
  const [delivery] = await EmailDelivery.findOrCreate({ where: { EventKey: key }, defaults: { EventKey: key, Recipient: recipient, Status: "pending", Attempts: 0 } });
  if (delivery.Status === "sent" || delivery.Status === "processing") return { sent: false, duplicate: true };
  await delivery.update({ Status: "processing", Attempts: Number(delivery.Attempts) + 1, LastError: null });
  try {
    const products = await sequelize.query<ProductRow>(`SELECT sp."Quantity", p."Description", sp."Saleprice" FROM "SaleProduct" sp LEFT JOIN "Product" p ON sp."ID_Product" = p."ID_Product" WHERE sp."ID_Sale" = :saleId`, { type: QueryTypes.SELECT, replacements: { saleId } });
    const address = sale.ID_Address ? await Address.findByPk(sale.ID_Address) : null;
    const folio = formatPublicFolio(sale, kind === "quote" ? "quote" : kind === "purchase" ? "order" : "sale");
    const subjects = { purchase: `Pago confirmado · ${folio}`, ticket: sale.Pagada === "Pendiente" ? `Venta a crédito · ${folio}` : `Ticket de compra · ${folio}`, quote: `Cotización · ${folio}` };
    await smtpTransport().sendMail({ from: process.env.SMTP_FROM?.trim() || `"${BRAND.name}" <${env("SMTP_USER")}>`, to: recipient, subject: `${subjects[kind]} | ${BRAND.name}`, html: renderEmail({ kind, sale, products, address: address?.Description }) });
    await delivery.update({ Status: "sent", SentAt: new Date(), LastError: null });
    return { sent: true, duplicate: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error SMTP";
    await delivery.update({ Status: "failed", LastError: message.slice(0, 1000) });
    throw error;
  }
}
