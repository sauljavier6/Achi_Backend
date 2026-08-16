import { QueryTypes } from "sequelize";
import sequelize from "../config/database";
import Address from "../models/Adress";
import PaymentSale from "../models/PaymentSale";
import Sale from "../models/Sale";
import State from "../models/State";
import User from "../models/User";
import { sendSaleEmail } from "../services/saleEmailService";
import { formatPublicFolio } from "../utils/publicFolio";

type TicketKind = "sale" | "quote";
type ProductRow = {
  Quantity: number;
  Description: string | null;
  StockDescription: string | null;
  Saleprice: number | null;
  TaxRate: number | null;
  TaxAmount: number | null;
};

const money = (value: unknown) => Number(value || 0).toLocaleString("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

const escapeHtml = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const dateTime = (value: unknown) => new Date(String(value)).toLocaleString("es-MX", {
  timeZone: "America/Tijuana",
  dateStyle: "medium",
  timeStyle: "short",
});

async function loadTicketData(id: number) {
  const sale = await Sale.findByPk(id, { include: [{ model: PaymentSale }, { model: State }] });
  if (!sale) return null;
  const plainSale = sale.get({ plain: true }) as any;
  const [customer, address, products] = await Promise.all([
    sale.ID_User ? User.findByPk(sale.ID_User) : Promise.resolve(null),
    sale.ID_Address ? Address.findByPk(sale.ID_Address) : Promise.resolve(null),
    sequelize.query<ProductRow>(`
      SELECT sp."Quantity", p."Description", s."Description" AS "StockDescription",
             sp."Saleprice", sp."TaxRate", sp."TaxAmount"
      FROM "SaleProduct" sp
      LEFT JOIN "Product" p ON sp."ID_Product" = p."ID_Product"
      LEFT JOIN "Stock" s ON sp."ID_Stock" = s."ID_Stock"
      WHERE sp."ID_Sale" = :saleId
      ORDER BY sp."ID_SaleProduct"
    `, { type: QueryTypes.SELECT, replacements: { saleId: id } }),
  ]);
  return {
    sale: plainSale,
    customer: customer?.get({ plain: true }) as any,
    address: address?.get({ plain: true }) as any,
    products,
    payments: (plainSale.PaymentSale ?? []) as any[],
  };
}

export function renderTicket(data: Awaited<ReturnType<typeof loadTicketData>> extends infer T ? NonNullable<T> : never, kind: TicketKind) {
  const { sale, customer, address, products, payments } = data;
  const isQuote = kind === "quote";
  const publicFolio = formatPublicFolio(sale, isQuote ? "quote" : "sale");
  const isCredit = !isQuote && sale.Pagada === "Pendiente" && Number(sale.Balance_Total) > 0;
  const itemCount = products.reduce((sum, product) => sum + Number(product.Quantity), 0);
  const productRows = products.map((product) => {
    const quantity = Number(product.Quantity);
    const unitPrice = Number(product.Saleprice || 0);
    const description = [product.Description || "Producto", product.StockDescription].filter(Boolean).join(" - ");
    return `<section class="item">
      <div class="item-name">${escapeHtml(description)}</div>
      <div class="row item-detail"><span>${quantity} x ${money(unitPrice)}</span><strong>${money(quantity * unitPrice)}</strong></div>
    </section>`;
  }).join("");
  const paymentRows = !isQuote && payments.length
    ? `<section class="section"><div class="section-title">Pagos registrados</div>${payments.map((payment) => `<div class="row"><span>${escapeHtml(payment.Description || "Pago")}</span><strong>${money(payment.Monto)}</strong></div>${payment.ReferenceNumber ? `<div class="note">Ref: ${escapeHtml(payment.ReferenceNumber)}</div>` : ""}`).join("")}</section>`
    : "";

  return `<!doctype html>
  <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${isQuote ? "Cotización" : "Ticket"} ${publicFolio}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; background: #eef0f3; color: #14171c; font-family: Arial, Helvetica, sans-serif; }
    .toolbar { display:flex; justify-content:center; padding:14px; }
    .toolbar button { border:0; border-radius:10px; background:#c70063; color:white; padding:10px 22px; font-weight:700; cursor:pointer; }
    .ticket { width:80mm; min-height:150mm; margin:0 auto 24px; padding:9mm 6mm 12mm; background:white; box-shadow:0 8px 28px rgba(15,23,42,.16); font-size:12px; line-height:1.45; }
    .brand { text-align:center; }
    .brand-name { color:#c70063; font-size:20px; font-weight:900; letter-spacing:.02em; }
    .brand-subtitle { margin-top:2px; color:#007782; font-size:11px; font-weight:700; }
    .muted { color:#5f6875; }
    .small { font-size:10px; }
    .document-title { margin:18px 0 4px; text-align:center; font-size:15px; font-weight:900; letter-spacing:.08em; }
    .status { margin:8px 0 16px; padding:7px 9px; border:1px solid #cbd2dc; border-radius:8px; text-align:center; font-weight:800; }
    .status.credit { border-color:#d29c14; background:#fff8df; }
    .divider { border-top:1px dashed #8c939e; margin:14px 0; }
    .section { margin:14px 0; }
    .section-title { margin-bottom:7px; color:#007782; font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; }
    .row { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin:4px 0; }
    .row span:first-child { min-width:0; }
    .row strong { flex:none; text-align:right; }
    .item { padding:10px 0; border-bottom:1px solid #e3e6ea; }
    .item-name { font-weight:800; overflow-wrap:anywhere; }
    .item-detail { margin-top:5px; color:#4e5865; }
    .note { color:#66707c; font-size:10px; overflow-wrap:anywhere; }
    .totals { margin-top:16px; padding:12px; border:1px solid #d9dee5; border-radius:10px; background:#f8f9fb; }
    .grand-total { margin-top:9px; padding-top:9px; border-top:2px solid #14171c; color:#c70063; font-size:16px; font-weight:900; }
    .balance { margin-top:12px; padding:10px; border:1px solid #d29c14; border-radius:8px; background:#fff8df; }
    .footer { margin-top:24px; text-align:center; }
    .footer strong { color:#007782; }
    @media print { body { background:white; } .toolbar { display:none; } .ticket { margin:0; box-shadow:none; } }
  </style></head><body>
    <div class="toolbar"><button type="button" onclick="window.print()">Imprimir</button></div>
    <main class="ticket">
      <header class="brand"><div class="brand-name">ACHI VETERINARIA</div><div class="brand-subtitle">Salud y bienestar para tu mascota</div><div class="muted small">Tijuana, Baja California</div><div class="muted small">Tel. (663) 403-2690</div></header>
      <div class="document-title">${isQuote ? "COTIZACIÓN" : "TICKET DE VENTA"}</div>
      <div class="status ${isCredit ? "credit" : ""}">${isQuote ? "Válida por 7 días" : isCredit ? "VENTA A CRÉDITO" : "PAGO REGISTRADO"}</div>
      <section class="section"><div class="row"><span>Folio</span><strong>${publicFolio}</strong></div><div class="row"><span>Fecha</span><strong>${escapeHtml(dateTime(sale.createdAt))}</strong></div><div class="row"><span>Artículos</span><strong>${itemCount}</strong></div></section>
      ${(customer || address) ? `<div class="divider"></div><section class="section"><div class="section-title">Cliente</div>${customer ? `<div><strong>${escapeHtml(customer.Name)}</strong></div>` : ""}${address?.Description ? `<div class="muted">${escapeHtml(address.Description)}</div>` : ""}</section>` : ""}
      <div class="divider"></div><section><div class="section-title">Detalle</div>${productRows || '<div class="muted">Sin productos</div>'}</section>
      ${paymentRows}
      <section class="totals"><div class="row"><span>Subtotal sin IVA</span><strong>${money(sale.Subtotal)}</strong></div><div class="row"><span>IVA desglosado</span><strong>${money(sale.Iva)}</strong></div>${Number(sale.Envio || 0) ? `<div class="row"><span>Envío</span><strong>${money(sale.Envio)}</strong></div>` : ""}<div class="row grand-total"><span>TOTAL</span><strong>${money(sale.Total)}</strong></div></section>
      ${isCredit ? `<section class="balance"><div class="row"><span>Saldo pendiente</span><strong>${money(sale.Balance_Total)}</strong></div><div class="small">Este documento no acredita la liquidación del adeudo.</div></section>` : ""}
      <footer class="footer"><strong>${isQuote ? "Gracias por considerarnos" : "¡Gracias por tu compra!"}</strong><div class="muted small">${isQuote ? "Precios sujetos a disponibilidad y cambio." : "Conserve este ticket como comprobante."}</div><div class="muted small">Este documento no es un CFDI.</div></footer>
    </main>
  </body></html>`;
}

async function print(req: any, res: any, kind: TicketKind) {
  try {
    const data = await loadTicketData(Number(req.params.id));
    if (!data) return res.status(404).send("Venta no encontrada");
    return res.type("html").send(renderTicket(data, kind));
  } catch (error) {
    console.error("Error al generar ticket:", error);
    return res.status(500).send("Error al generar el ticket");
  }
}

export const printTicket = (req: any, res: any) => print(req, res, "sale");
export const printTicketCotizacion = (req: any, res: any) => print(req, res, "quote");

export const sendTicketByEmail = async (req: any, res: any) => {
  try {
    await sendSaleEmail(Number(req.params.id), "ticket", `ticket:${req.params.id}`);
    return res.json({ message: "Ticket enviado exitosamente" });
  } catch (error) {
    console.error("Error al enviar ticket:", error);
    return res.status(500).json({ message: "Error al enviar el ticket por correo" });
  }
};

export const sendCotizacionByEmail = async (req: any, res: any) => {
  try {
    await sendSaleEmail(Number(req.params.id), "quote", `quote:${req.params.id}`);
    return res.json({ message: "Cotización enviada exitosamente" });
  } catch (error) {
    console.error("Error al enviar cotización:", error);
    return res.status(500).json({ message: "Error al enviar la cotización por correo" });
  }
};
