import { Op } from "sequelize";
import Iva from "../models/Iva";
import PaymentSale from "../models/PaymentSale";
import Product from "../models/Product";
import Sale from "../models/Sale";
import SaleProduct from "../models/SaleProduct";
import State from "../models/State";
import Stock from "../models/Stock";
import User from "../models/User";
import Email from "../models/Email";
import Phone from "../models/Phone";
import { createTaxSnapshot, extractIncludedTax, roundMoney } from "../utils/taxInclusive";

const QUOTE_STATE_ID = 1;

async function getUserSummary(userId: number) {
  const user = await User.findByPk(userId, {
    attributes: ["ID_User", "Name"],
    include: [{ model: Email, attributes: ["Description"] }, { model: Phone, attributes: ["Description"] }],
  });
  if (!user) return null;
  const plain = user.get({ plain: true }) as any;
  return {
    ID_User: plain.ID_User,
    Name: plain.Name,
    Email: plain.Email?.Description ?? "",
    Phone: plain.Phone?.Description ?? "",
  };
}

function createBatch(userId = 0) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `${datePart}${String(userId).padStart(3, "0")}${randomPart}`;
}

async function normalizeQuoteItems(items: any[], transaction: any) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("La cotización debe incluir al menos un producto");
  }

  const seen = new Set<number>();
  const normalized = [];
  let subtotal = 0;
  let iva = 0;
  let total = 0;

  for (const rawItem of items) {
    const stockId = Number(rawItem.stockId);
    const quantity = Number(rawItem.quantity);
    if (!Number.isInteger(stockId) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("La cantidad y la presentación seleccionada no son válidas");
    }
    if (seen.has(stockId)) {
      throw new Error("Una presentación no puede aparecer duplicada");
    }
    seen.add(stockId);

    const stock = await Stock.findOne({
      where: { ID_Stock: stockId, State: true },
      include: [{ model: Product, include: [{ model: Iva }] }],
      transaction,
    });
    const associatedProduct = stock ? (stock.get({ plain: true }) as any).Product : null;
    if (!stock || !associatedProduct || associatedProduct.State !== true) throw new Error(`La presentación ${stockId} ya no está disponible`);
    if (Number(stock.Amount) < quantity) {
      throw new Error(`Stock insuficiente para ${associatedProduct.Description} (${stock.Description})`);
    }

    const price = Number(stock.Saleprice);
    const lineSubtotal = price * quantity;
    const tax = extractIncludedTax(lineSubtotal, associatedProduct.Iva?.Iva);
    subtotal += tax.base;
    iva += tax.tax;
    total += tax.gross;
    normalized.push({
      ID_Product: stock.ID_Product,
      ID_Stock: stock.ID_Stock,
      Quantity: quantity,
      Saleprice: price,
      ...createTaxSnapshot({
        unitPrice: price,
        quantity,
        taxId: associatedProduct.ID_Iva,
        taxName: associatedProduct.Iva?.Description,
        taxValue: associatedProduct.Iva?.Iva,
      }),
      State: true,
    });
  }

  return { items: normalized, subtotal: roundMoney(subtotal), iva: roundMoney(iva), total: roundMoney(total) };
}

export const getListQuotes = async (req: any, res: any) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const searchTerm = String(req.query.searchTerm || "").trim();
    const userIds = searchTerm
      ? (await User.findAll({ where: { Name: { [Op.iLike]: `%${searchTerm}%` } }, attributes: ["ID_User"] })).map((u) => u.ID_User)
      : [];
    const numericId = /^\d+$/.test(searchTerm) ? Number(searchTerm) : null;
    const searchWhere = searchTerm
      ? {
          [Op.or]: [
            ...(numericId !== null ? [{ ID_Sale: numericId }] : []),
            ...(userIds.length ? [{ ID_User: { [Op.in]: userIds } }] : []),
          ],
        }
      : {};

    const result = await Sale.findAndCountAll({
      where: { ID_State: QUOTE_STATE_ID, ...searchWhere },
      order: [["ID_Sale", "DESC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    const data = await Promise.all(result.rows.map(async (sale) => ({
      ...sale.toJSON(),
      user: sale.ID_User ? await getUserSummary(sale.ID_User) : null,
      operator: sale.ID_Operador ? await User.findByPk(sale.ID_Operador, { attributes: ["ID_User", "Name"] }) : null,
    })));
    const totalPages = Math.max(1, Math.ceil(result.count / limit));
    return res.status(200).json({ data, totalItems: result.count, totalPages, currentPage: page, hasMore: page < totalPages });
  } catch (error) {
    console.error("Error al obtener las cotizaciones:", error);
    return res.status(500).json({ message: "No fue posible obtener las cotizaciones" });
  }
};

export const searchQuotesForCheckout = async (req: any, res: any) => {
  try {
    const query = String(req.query.q || "").trim();
    if (!query) return res.json({ data: [] });
    const numericId = /^\d+$/.test(query.replace(/^COT-/i, "")) ? Number(query.replace(/^COT-/i, "")) : null;
    const [matchingEmails, matchingPhones] = await Promise.all([
      Email.findAll({ where: { Description: { [Op.iLike]: `%${query}%` } }, attributes: ["ID_Email"], limit: 20 }),
      Phone.findAll({ where: { Description: { [Op.iLike]: `%${query}%` } }, attributes: ["ID_Phone"], limit: 20 }),
    ]);
    const emailIds = matchingEmails.map((email) => email.ID_Email);
    const phoneIds = matchingPhones.map((phone) => phone.ID_Phone);
    const matchingUsers = await User.findAll({
      where: {
        [Op.or]: [
          { Name: { [Op.iLike]: `%${query}%` } },
          ...(emailIds.length ? [{ ID_Email: { [Op.in]: emailIds } }] : []),
          ...(phoneIds.length ? [{ ID_Phone: { [Op.in]: phoneIds } }] : []),
        ],
      },
      attributes: ["ID_User"],
      limit: 20,
    });
    const userIds = matchingUsers.map((user) => user.ID_User);
    if (!numericId && !userIds.length) return res.json({ data: [] });
    const quotes = await Sale.findAll({
      where: {
        ID_State: QUOTE_STATE_ID,
        DocumentType: "QUOTE",
        DocumentStatus: "ACTIVE",
        ConvertedSaleId: null,
        [Op.or]: [
          ...(numericId ? [{ ID_Sale: numericId }] : []),
          ...(userIds.length ? [{ ID_User: { [Op.in]: userIds } }] : []),
        ],
      },
      order: [["ID_Sale", "DESC"]],
      limit: 10,
    });
    const data = await Promise.all(quotes.map(async (quote) => ({
      ID_Sale: quote.ID_Sale,
      Total: quote.Total,
      createdAt: quote.createdAt,
      QuoteExpiresAt: quote.QuoteExpiresAt,
      expired: Boolean(quote.QuoteExpiresAt && new Date(quote.QuoteExpiresAt).getTime() < Date.now()),
      user: quote.ID_User ? await getUserSummary(quote.ID_User) : null,
    })));
    return res.json({ data });
  } catch (error) {
    console.error("Error buscando cotizaciones para Caja:", error);
    return res.status(500).json({ message: "No fue posible buscar cotizaciones" });
  }
};

export const createQuotes = async (req: any, res: any) => {
  const transaction = await Sale.sequelize!.transaction();
  try {
    const normalized = await normalizeQuoteItems(req.body.items, transaction);
    const operatorId = Number(req.user?.ID_User ?? req.body.ID_Operador);
    if (!Number.isInteger(operatorId) || operatorId < 1) throw new Error("Operador no válido");
    const customerId = Number(req.body.ID_User) > 0 ? Number(req.body.ID_User) : null;

    const sale = await Sale.create({
      ID_User: customerId,
      Total: normalized.total,
      Balance_Total: normalized.total,
      Subtotal: normalized.subtotal,
      Iva: normalized.iva,
      Envio: 0,
      ID_State: QUOTE_STATE_ID,
      ID_Operador: operatorId,
      Batch: createBatch(operatorId),
      Pagada: "Pendiente",
      StateSale: true,
      DocumentType: "QUOTE",
      DocumentStatus: "ACTIVE",
      QuoteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }, { transaction });
    await SaleProduct.bulkCreate(normalized.items.map((item) => ({ ...item, ID_Sale: sale.ID_Sale })), { transaction });
    await transaction.commit();
    return res.status(201).json({ message: "Cotización registrada correctamente", data: { ...sale.toJSON(), items: normalized.items } });
  } catch (error: any) {
    await transaction.rollback();
    console.error("Error al crear la cotización:", error);
    return res.status(400).json({ message: error?.message || "No fue posible crear la cotización" });
  }
};

export const getQuotesById = async (req: any, res: any) => {
  try {
    const sale = await Sale.findOne({
      where: { ID_Sale: req.params.id, ID_State: QUOTE_STATE_ID },
      include: [
        { model: State },
        { model: PaymentSale },
        { model: SaleProduct, include: [
          { model: Product, attributes: ["ID_Product", "Description"], include: [{ model: Iva }] },
          { model: Stock, attributes: ["ID_Stock", "Description", "Saleprice", "Amount", "State"] },
        ] },
      ],
    });
    if (!sale) return res.status(404).json({ message: "Cotización no encontrada" });
    return res.status(200).json({ data: {
      ...sale.toJSON(),
      user: sale.ID_User ? await getUserSummary(sale.ID_User) : null,
      operator: sale.ID_Operador ? await User.findByPk(sale.ID_Operador, { attributes: ["ID_User", "Name"] }) : null,
    } });
  } catch (error) {
    console.error("Error al obtener la cotización:", error);
    return res.status(500).json({ message: "No fue posible obtener la cotización" });
  }
};

export const updateQuotes = async (req: any, res: any) => {
  const transaction = await Sale.sequelize!.transaction();
  try {
    const saleId = Number(req.params.id);
    if (Number(req.body.ID_Sale) !== saleId) throw new Error("El folio de la cotización no coincide");
    const sale = await Sale.findOne({ where: { ID_Sale: saleId, ID_State: QUOTE_STATE_ID }, transaction });
    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({ message: "Cotización no encontrada" });
    }
    if (sale.DocumentStatus !== "ACTIVE" || sale.ConvertedSaleId) {
      throw new Error("La cotización ya fue convertida o no está activa");
    }
    const normalized = await normalizeQuoteItems(req.body.items, transaction);
    const customerId = Number(req.body.ID_User) > 0 ? Number(req.body.ID_User) : null;

    await sale.update({
      ID_User: customerId,
      Total: normalized.total,
      Balance_Total: normalized.total,
      Subtotal: normalized.subtotal,
      Iva: normalized.iva,
      Envio: 0,
      ID_State: QUOTE_STATE_ID,
      Pagada: "Pendiente",
    }, { transaction });
    await PaymentSale.destroy({ where: { ID_Sale: saleId }, transaction });
    await SaleProduct.destroy({ where: { ID_Sale: saleId }, transaction });
    await SaleProduct.bulkCreate(normalized.items.map((item) => ({ ...item, ID_Sale: saleId })), { transaction });
    // Las cotizaciones no reservan ni alteran inventario. El stock se descuenta únicamente al vender.
    await transaction.commit();
    return res.json({ message: "Cotización actualizada correctamente", data: { ...sale.toJSON(), items: normalized.items } });
  } catch (error: any) {
    await transaction.rollback();
    console.error("Error al actualizar la cotización:", error);
    return res.status(400).json({ message: error?.message || "No fue posible actualizar la cotización" });
  }
};
