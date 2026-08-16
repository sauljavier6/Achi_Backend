import crypto from "crypto";
import { Request, Response } from "express";
import { formatPublicFolio } from "../utils/publicFolio";
import { Transaction } from "sequelize";
import sequelize from "../config/database";
import Address from "../models/Adress";
import Email from "../models/Email";
import Iva from "../models/Iva";
import PaymentSale from "../models/PaymentSale";
import Phone from "../models/Phone";
import Product from "../models/Product";
import Sale from "../models/Sale";
import SaleProduct from "../models/SaleProduct";
import Stock from "../models/Stock";
import User from "../models/User";
import { sendSaleEmail } from "../services/saleEmailService";
import { createTaxSnapshot, extractIncludedTax, roundMoney } from "../utils/taxInclusive";

type CheckoutItem = { ID_Product: number; ID_Stock: number; Quantity: number };

type MercadoPagoPayment = {
  id: number;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
};

const SHIPPING_COST = Number(process.env.SHIPPING_COST ?? 250);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta configurar ${name}`);
  return value;
}

async function mercadoPagoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requiredEnv("MERCADOPAGO_ACCESS_TOKEN")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) throw new Error(`Mercado Pago respondió ${response.status}`);
  return (await response.json()) as T;
}

async function createPendingSale(data: any) {
  const items = data?.items as CheckoutItem[];
  if (!Array.isArray(items) || items.length === 0) throw new Error("El carrito está vacío");
  if (!data.name?.trim() || !data.email?.trim() || !data.phone?.trim() || !data.address?.trim()) {
    throw new Error("Faltan datos del comprador");
  }

  return sequelize.transaction(async (transaction) => {
    const validatedItems = [] as Array<{
      product: Product; stock: Stock; quantity: number; unitPrice: number; ivaRate: number; ivaRecord: Iva | null;
    }>;

    for (const rawItem of items) {
      const quantity = Number(rawItem.Quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Cantidad inválida");

      const stock = await Stock.findOne({
        // ID_Stock es la referencia autoritativa: el producto se obtiene de su relación.
        // Esto evita rechazos por carritos antiguos que conservaron un ID_Product obsoleto.
        where: { ID_Stock: Number(rawItem.ID_Stock), State: true },
        transaction,
      });
      if (!stock) throw new Error("La presentación seleccionada ya no está disponible");
      const product = await Product.findByPk(stock.ID_Product, { transaction });
      if (!product) throw new Error("El producto de la presentación ya no está disponible");
      if (Number(stock.Amount) < quantity) {
        throw new Error(`Stock insuficiente para ${product.Description}: disponibles ${stock.Amount}`);
      }

      const unitPrice = Number(stock.Saleprice);
      const ivaRecord = await Iva.findByPk(product.ID_Iva, { transaction });
      const ivaRate = Number(ivaRecord?.Iva ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(ivaRate)) {
        throw new Error("Precio o IVA inválido");
      }
      validatedItems.push({ product, stock, quantity, unitPrice, ivaRate, ivaRecord });
    }

    const amounts = validatedItems.reduce((sum, item) => {
      const included = extractIncludedTax(item.unitPrice * item.quantity, item.ivaRate);
      return { subtotal: sum.subtotal + included.base, iva: sum.iva + included.tax, gross: sum.gross + included.gross };
    }, { subtotal: 0, iva: 0, gross: 0 });
    const subtotal = roundMoney(amounts.subtotal);
    const iva = roundMoney(amounts.iva);
    const total = roundMoney(amounts.gross + SHIPPING_COST);

    let email = await Email.findOne({ where: { Description: data.email.trim() }, transaction });
    if (!email) email = await Email.create({ Description: data.email.trim(), State: true }, { transaction });
    let phone = await Phone.findOne({ where: { Description: data.phone.trim() }, transaction });
    if (!phone) phone = await Phone.create({ Description: data.phone.trim(), State: true }, { transaction });
    let user = await User.findOne({ where: { ID_Email: email.ID_Email }, transaction });
    if (!user) {
      user = await User.create({
        Name: data.name.trim(), ID_Rol: 2, ID_Email: email.ID_Email,
        ID_Phone: phone.ID_Phone, Imagen: "", Password: "", State: true,
      }, { transaction });
    }

    const address = await Address.create({ Description: data.address.trim(), State: true }, { transaction });
    const sale = await Sale.create({
      ID_User: user.ID_User, Subtotal: subtotal, Total: total, Envio: SHIPPING_COST,
      Iva: iva, Balance_Total: total, ID_State: 2, ID_Address: address.ID_Address,
      ID_Operador: 1, Batch: "web", Pagada: "Pendiente",
    }, { transaction });

    for (const item of validatedItems) {
      await SaleProduct.create({
        ID_Sale: sale.ID_Sale, ID_Product: item.product.ID_Product,
        ID_Stock: item.stock.ID_Stock, Quantity: item.quantity,
        Saleprice: item.unitPrice, State: true,
        ...createTaxSnapshot({
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          taxId: item.product.ID_Iva,
          taxName: item.ivaRecord?.Description,
          taxValue: item.ivaRate,
        }),
      }, { transaction });
    }
    return { sale, validatedItems, total };
  });
}

export async function createCheckout(req: Request, res: Response) {
  try {
    const { sale, validatedItems, total } = await createPendingSale(req.body);
    const frontendUrl = requiredEnv("FRONTEND_PUBLIC_URL").replace(/\/$/, "");
    const backendUrl = requiredEnv("BACKEND_PUBLIC_URL").replace(/\/$/, "");
    const preference = await mercadoPagoRequest<{ id: string; init_point: string }>("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{
          id: String(sale.ID_Sale), title: `Pedido Achi Veterinaria ${formatPublicFolio(sale, "order")}`,
          quantity: 1, currency_id: "MXN", unit_price: total,
        }],
        payer: { email: req.body.email.trim(), name: req.body.name.trim() },
        external_reference: String(sale.ID_Sale),
        notification_url: `${backendUrl}/api/mercadopago/webhook?source_news=webhooks`,
        back_urls: {
          success: `${frontendUrl}/pago/resultado?status=success`,
          pending: `${frontendUrl}/pago/resultado?status=pending`,
          failure: `${frontendUrl}/pago/resultado?status=failure`,
        },
        auto_return: "approved",
        metadata: { sale_id: sale.ID_Sale, expected_total: total },
      }),
    });
    return res.status(201).json({ saleId: sale.ID_Sale, checkoutUrl: preference.init_point });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible crear el pago";
    return res.status(message.startsWith("Falta configurar") ? 503 : 400).json({ message });
  }
}

function validWebhookSignature(req: Request): boolean {
  const signature = req.header("x-signature") ?? "";
  const requestId = req.header("x-request-id") ?? "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  const dataId = String(req.query["data.id"] ?? req.body?.data?.id ?? "").toLowerCase();
  if (!parts.ts || !parts.v1 || !requestId || !dataId) {
    console.warn("Webhook Mercado Pago incompleto", {
      hasTimestamp: Boolean(parts.ts), hasSignature: Boolean(parts.v1),
      hasRequestId: Boolean(requestId), hasDataId: Boolean(dataId),
    });
    return false;
  }
  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;
  const digest = crypto.createHmac("sha256", requiredEnv("MERCADOPAGO_WEBHOOK_SECRET")).update(manifest).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const received = Buffer.from(parts.v1, "hex");
  const valid = expected.length === received.length && crypto.timingSafeEqual(expected, received);
  if (!valid) {
    console.warn("Firma de webhook Mercado Pago no coincide", {
      dataId, timestampDigits: parts.ts.length, signatureHexLength: parts.v1.length,
      requestIdLength: requestId.length,
    });
  }
  return valid;
}

async function approveSale(payment: MercadoPagoPayment, transaction: Transaction) {
  const saleId = Number(payment.external_reference);
  if (!Number.isInteger(saleId)) throw new Error("Referencia de venta inválida");
  const sale = await Sale.findByPk(saleId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!sale) throw new Error("Venta no encontrada");
  if (payment.currency_id !== "MXN" || Math.abs(Number(sale.Total) - Number(payment.transaction_amount)) > 0.01) {
    throw new Error("El importe del pago no coincide con la venta");
  }
  const duplicate = await PaymentSale.findOne({ where: { ReferenceNumber: String(payment.id) }, transaction });
  if (duplicate || sale.Pagada === "Pagada") return { saleId: sale.ID_Sale, newlyApproved: false };

  const saleItems = await SaleProduct.findAll({ where: { ID_Sale: sale.ID_Sale }, transaction });
  for (const item of saleItems) {
    const stock = await Stock.findByPk(item.ID_Stock, { transaction, lock: transaction.LOCK.UPDATE });
    if (!stock || Number(stock.Amount) < item.Quantity) throw new Error("Stock insuficiente al confirmar pago");
    await stock.update({ Amount: Number(stock.Amount) - item.Quantity }, { transaction });
  }
  await sale.update({ Pagada: "Pagada", Balance_Total: 0 }, { transaction });
  await PaymentSale.create({
    ID_Sale: sale.ID_Sale, ID_Payment: 2, Description: "Mercado Pago",
    Monto: payment.transaction_amount, ReferenceNumber: String(payment.id), State: true,
  }, { transaction });
  return { saleId: sale.ID_Sale, newlyApproved: true };
}

async function confirmPayment(payment: MercadoPagoPayment) {
  const result = await sequelize.transaction((transaction) => approveSale(payment, transaction));
  await sendSaleEmail(result.saleId, "purchase", `mercadopago:${payment.id}`);
  return result;
}

export async function mercadoPagoWebhook(req: Request, res: Response) {
  try {
    if (!validWebhookSignature(req)) return res.status(401).json({ message: "Firma inválida" });
    if (req.body?.type && req.body.type !== "payment") return res.sendStatus(200);
    const paymentId = String(req.query["data.id"] ?? req.body?.data?.id ?? "");
    const payment = await mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
    if (payment.status !== "approved") return res.sendStatus(200);
    const { saleId, newlyApproved } = await confirmPayment(payment);
    console.info(`Venta web ${saleId} ${newlyApproved ? "confirmada" : "ya confirmada"} por Mercado Pago`);
    return res.sendStatus(200);
  } catch (error) {
    // El simulador oficial usa un ID ficticio inexistente. Como la firma ya
    // fue validada, confirmamos la recepción sin crear ni modificar ventas.
    if (error instanceof Error && /\b404\b/.test(error.message)) {
      console.info("Webhook de prueba Mercado Pago recibido correctamente");
      return res.sendStatus(200);
    }
    console.error("Error procesando webhook de Mercado Pago", error);
    return res.sendStatus(500);
  }
}

export async function reconcileMercadoPagoPayment(req: Request, res: Response) {
  try {
    const paymentId = String(req.body?.paymentId ?? "");
    if (!/^\d+$/.test(paymentId)) return res.status(400).json({ message: "Identificador de pago inválido" });
    const payment = await mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
    if (payment.status !== "approved") {
      return res.status(409).json({ message: "El pago todavía no está aprobado", status: payment.status });
    }
    const { saleId } = await confirmPayment(payment);
    return res.json({ message: "Pago confirmado", saleId, status: "approved" });
  } catch (error) {
    console.error("Error reconciliando pago de Mercado Pago", error);
    const message = error instanceof Error ? error.message : "No fue posible confirmar el pago";
    return res.status(400).json({ message });
  }
}
