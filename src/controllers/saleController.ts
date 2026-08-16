// @/controllers/SaleController.ts
import Category from "../models/Category";
import Product from "../models/Product";
import Sale from "../models/Sale";
import Stock from "../models/Stock";
import { Op } from "sequelize";
import User from "../models/User";
import PaymentSale from "../models/PaymentSale";
import ProductSale from "../models/SaleProduct";
import Email from "../models/Email";
import Phone from "../models/Phone";
import Facturacion from "../models/Facturacion";
import SaleProduct from "../models/SaleProduct";
import State from "../models/State";
import Payment from "../models/Payment";
import Iva from "../models/Iva";
import Address from "../models/Adress";
import { createTaxSnapshot, extractIncludedTax, roundMoney } from "../utils/taxInclusive";

export const getListSale = async (req: any, res: any) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.searchTerm || "";
    const numericFolio = /^\d{1,6}$/.test(String(searchTerm).trim()) ? Number(searchTerm) : null;

    let sales: Sale[] = [];
    let count = 0;

    if (searchTerm && numericFolio !== null) {
      // Buscar por ID_Sale sin paginación
      const result = await Sale.findAndCountAll({
        where: {
          ID_State: 2,
          ID_Sale: numericFolio,
        },
        order: [["ID_Sale", "DESC"]],
        distinct: true,
      });

      sales = result.rows;
      count = result.count;
    } else if (!searchTerm) {
      // Paginación normal
      const result = await Sale.findAndCountAll({
        where: { ID_State: 2 },
        order: [["ID_Sale", "DESC"]],
        limit,
        offset,
        distinct: true,
      });

      sales = result.rows;
      count = result.count;
    } else {
      sales = [];
      count = 0;
    }

    // Incluir info de user y operator
    const salesWithUserAndOperator = await Promise.all(
      sales.map(async (sale) => {
        const user = sale.ID_User
          ? await User.findOne({
              where: { ID_User: sale.ID_User },
              attributes: ["ID_User", "Name"],
            })
          : null;

        const operator = sale.ID_Operador
          ? await User.findOne({
              where: { ID_User: sale.ID_Operador },
              attributes: ["ID_User", "Name"],
            })
          : null;

        return {
          ...sale.toJSON(),
          user,
          operator,
        };
      }),
    );

    const totalPages = searchTerm ? 1 : Math.ceil(count / limit);

    res.status(200).json({
      data: salesWithUserAndOperator,
      message: "Lista de ventas obtenida correctamente",
      totalItems: count,
      totalPages,
      currentPage: searchTerm ? 1 : page,
      hasMore: !searchTerm && page < totalPages,
    });
  } catch (error) {
    console.error("Error al obtener las ventas:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const createSale = async (req: any, res: any) => {
  const t = await Sale.sequelize?.transaction();
  try {
    const {
      ID_User,
      Envio,
      ID_State,
      Payment: paymentInput,
      ID_Operador,
      Lote,
      State,
      items,
      IsCredit,
      SourceQuoteId,
    } = req.body;

    const isCredit = IsCredit === true;
    const sourceQuoteId = Number(SourceQuoteId || 0);
    let sourceQuote: Sale | null = null;
    let quoteItems: SaleProduct[] = [];
    if (sourceQuoteId > 0) {
      sourceQuote = await Sale.findByPk(sourceQuoteId, { transaction: t, lock: t?.LOCK.UPDATE });
      if (!sourceQuote || sourceQuote.ID_State !== 1 || sourceQuote.DocumentType !== "QUOTE") {
        const invalid: any = new Error("La cotización no existe o no es válida"); invalid.status = 404; throw invalid;
      }
      if (sourceQuote.DocumentStatus !== "ACTIVE" || sourceQuote.ConvertedSaleId) {
        const converted: any = new Error(`La cotización ya fue convertida${sourceQuote.ConvertedSaleId ? ` en la venta #${sourceQuote.ConvertedSaleId}` : ""}`); converted.status = 409; throw converted;
      }
      if (sourceQuote.QuoteExpiresAt && new Date(sourceQuote.QuoteExpiresAt).getTime() < Date.now()) {
        const expired: any = new Error("La cotización está vencida. Actualízala antes de convertirla en venta"); expired.status = 409; throw expired;
      }
      quoteItems = await SaleProduct.findAll({ where: { ID_Sale: sourceQuoteId, State: true }, transaction: t, lock: t?.LOCK.UPDATE });
    }
    const itemsToProcess = quoteItems.length
      ? quoteItems.map((item) => ({ stockId: item.ID_Stock, quantity: item.Quantity, quoteItem: item }))
      : items;
    if (!Array.isArray(itemsToProcess) || itemsToProcess.length === 0) {
      await t?.rollback();
      return res.status(400).json({ message: "La venta requiere al menos un producto" });
    }

    const normalizedItems: Array<{ productId: number; stockId: number; quantity: number; price: number; taxSnapshot: ReturnType<typeof createTaxSnapshot> }> = [];
    let calculatedSubtotal = 0;
    let calculatedIva = 0;
    let calculatedGross = 0;
    const seenStocks = new Set<number>();
    for (const item of itemsToProcess) {
      const stockId = Number(item.stockId);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(stockId) || !Number.isInteger(quantity) || quantity <= 0 || seenStocks.has(stockId)) {
        throw new Error("Los productos de la venta no son válidos");
      }
      seenStocks.add(stockId);
      const stock = await Stock.findOne({
        where: { ID_Stock: stockId, State: true },
        include: [{ model: Product, include: [{ model: Iva }] }],
        transaction: t,
      });
      const associatedProduct = stock ? (stock.get({ plain: true }) as any).Product : null;
      if (!stock || !associatedProduct || associatedProduct.State !== true) {
        const unavailable: any = new Error("El producto está inactivo o ya no está disponible. Retíralo de la venta y vuelve a buscarlo.");
        unavailable.status = 409;
        throw unavailable;
      }
      if (Number(stock.Amount) < quantity) {
        const insufficient: any = new Error(`Stock insuficiente para ${associatedProduct.Description} (${stock.Description})`);
        insufficient.status = 409;
        throw insufficient;
      }
      const quoteItem = item.quoteItem as SaleProduct | undefined;
      const price = Number(quoteItem?.Saleprice ?? stock.Saleprice);
      const taxSnapshot = quoteItem
        ? {
            ID_IvaSnapshot: quoteItem.ID_IvaSnapshot ?? null,
            TaxName: quoteItem.TaxName,
            TaxRate: Number(quoteItem.TaxRate),
            TaxBase: Number(quoteItem.TaxBase),
            TaxAmount: Number(quoteItem.TaxAmount),
            TaxGross: Number(quoteItem.TaxGross),
            TaxObject: quoteItem.TaxObject,
            TaxFactor: quoteItem.TaxFactor,
            TaxSnapshotSource: "captured" as const,
          }
        : createTaxSnapshot({
            unitPrice: price,
            quantity,
            taxId: associatedProduct.ID_Iva,
            taxName: associatedProduct.Iva?.Description,
            taxValue: associatedProduct.Iva?.Iva,
          });
      const included = quoteItem
        ? { base: Number(quoteItem.TaxBase), tax: Number(quoteItem.TaxAmount), gross: Number(quoteItem.TaxGross) }
        : extractIncludedTax(price * quantity, associatedProduct.Iva?.Iva);
      calculatedSubtotal += included.base;
      calculatedIva += included.tax;
      calculatedGross += included.gross;
      normalizedItems.push({ productId: stock.ID_Product, stockId, quantity, price, taxSnapshot });
    }
    const shipping = roundMoney(Number(Envio ?? 0));
    const saleSubtotal = roundMoney(calculatedSubtotal);
    const saleIva = roundMoney(calculatedIva);
    const saleTotal = roundMoney(calculatedGross + shipping);
    const effectiveUserId = sourceQuote?.ID_User ?? ID_User;
    if (isCredit && (!effectiveUserId || Number(effectiveUserId) <= 0)) {
      await t?.rollback();
      return res.status(400).json({ message: "La venta a crédito requiere un cliente" });
    }
    if (!isCredit && (!Array.isArray(paymentInput) || paymentInput.length === 0)) {
      await t?.rollback();
      return res.status(400).json({ message: "La venta requiere un pago" });
    }
    const safePayments = Array.isArray(paymentInput) ? paymentInput : [];
    if (isCredit && safePayments.length > 0) {
      await t?.rollback();
      return res.status(400).json({ message: "Una venta a crédito no debe registrar pagos al momento de crearla" });
    }
    const paymentIds = [...new Set(safePayments.map((payment: any) => Number(payment.ID_Payment)))];
    const paymentMethods = paymentIds.length
      ? await Payment.findAll({ where: { ID_Payment: paymentIds, State: true }, transaction: t })
      : [];
    if (paymentMethods.length !== paymentIds.length) {
      await t?.rollback();
      return res.status(400).json({ message: "Uno de los métodos de pago no existe o está inactivo" });
    }
    const normalizePayment = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    if (!isCredit && paymentMethods.some((method) => normalizePayment(method.Description) === "credito")) {
      await t?.rollback();
      return res.status(400).json({ message: "Crédito es un tipo de venta, no un método de pago recibido" });
    }
    const paymentNames = new Map(paymentMethods.map((method) => [method.ID_Payment, method.Description]));
    const totalPayments = safePayments.reduce(
      (sum: number, p: any) => sum + Number(p.Monto),
      0,
    );
    if (safePayments.some((payment: any) => !Number.isFinite(Number(payment.Monto)) || Number(payment.Monto) <= 0)) {
      await t?.rollback();
      return res.status(400).json({ message: "Los pagos deben tener montos válidos" });
    }
    if (!isCredit && totalPayments + 0.009 < saleTotal) {
      await t?.rollback();
      return res.status(400).json({ message: "El pago debe cubrir el total de la venta" });
    }
    if (!isCredit && totalPayments - saleTotal > 0.009) {
      await t?.rollback();
      return res.status(400).json({ message: "El pago registrado no puede superar el total de la venta" });
    }

    const newSale = await Sale.create(
      {
        ID_User: sourceQuote?.ID_User ?? ID_User,
        Total: saleTotal,
        Balance_Total: isCredit ? saleTotal : 0,
        Subtotal: saleSubtotal,
        Iva: saleIva,
        Envio: shipping,
        ID_State,
        ID_Operador,
        Batch: Lote,
        State: State ?? true,
        Pagada: isCredit ? "Pendiente" : "Pagada",
        DocumentType: "SALE",
        DocumentStatus: "ACTIVE",
        SourceQuoteId: sourceQuote?.ID_Sale ?? null,
      },
      { transaction: t },
    );

    if (safePayments.length > 0) {
      const paymentSales = safePayments.map((p) => ({
        ID_Sale: newSale.ID_Sale,
        ID_Payment: p.ID_Payment,
        Description: paymentNames.get(Number(p.ID_Payment)) ?? "Pago",
        Monto: p.Monto,
        ReferenceNumber: p.ReferenceNumber,
        State: true,
      }));

      await PaymentSale.bulkCreate(paymentSales, { transaction: t });
    }

    if (normalizedItems.length > 0) {
      const productSales = normalizedItems.map((item) => ({
        ID_Sale: newSale.ID_Sale,
        ID_Product: item.productId,
        ID_Stock: item.stockId,
        Quantity: item.quantity,
        Saleprice: item.price,
        ...item.taxSnapshot,
        State: true,
      }));

      await ProductSale.bulkCreate(productSales, { transaction: t });

      for (const item of normalizedItems) {
        const stock = await Stock.findByPk(item.stockId, { transaction: t });
        if (!stock) {
          throw new Error(`No se encontró stock con ID ${item.stockId}`);
        }

        if (stock.Amount < item.quantity) {
          throw new Error(
            `Stock insuficiente para el producto ${item.productId}`,
          );
        }

        stock.Amount -= item.quantity;
        await stock.save({ transaction: t });
      }
    }

    if (sourceQuote) {
      await sourceQuote.update({
        DocumentStatus: "CONVERTED",
        ConvertedSaleId: newSale.ID_Sale,
        ConvertedAt: new Date(),
        ConvertedBy: Number(ID_Operador),
      }, { transaction: t });
    }

    await t?.commit();

    res.status(201).json({
      message: "Venta completada con pagos, productos y stock actualizado",
      data: newSale,
    });
  } catch (error) {
    await t?.rollback();
    console.error("Error al crear la venta:", error);
    res.status((error as any)?.status || 500).json({
      message: (error as Error)?.message || "Error al crear la venta",
    });
  }
};

export const searchProducts = async (req: any, res: any) => {
  const { q } = req.query;

  try {
    const products = await Product.findAll({
      where: {
        State: true,
        [Op.or]: [{ Description: { [Op.iLike]: `${q}%` } }, { Code: q }],
      },
      include: [
        {
          model: Stock,
          where: {
            State: true,
            Amount: {
              [Op.gt]: 0,
            },
          },
          required: true,
        },
        {
          model: Iva,
        },
      ],
    });

    res.json(products);
  } catch (error) {
    console.error("Error al buscar productos:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const createCustomerSale = async (req: any, res: any) => {
  try {
    const {
      Name,
      Phone: phoneValue,
      Email: emailValue,
      RazonSocial,
      CodigoPostal,
      Rfc,
      RegimenFiscal,
    } = req.body;

    const emailCreated = await Email.create({
      Description: emailValue,
      State: true,
    });

    const phoneCreated = await Phone.create({
      Description: phoneValue,
      State: true,
    });

    const newUser = await User.create({
      Name,
      ID_Rol: 2,
      ID_Email: emailCreated.ID_Email,
      ID_Phone: phoneCreated.ID_Phone,
      Imagen: "",
      Password: "",
      State: true,
    });

    const newFacturacion = await Facturacion.create({
      ID_User: newUser.ID_User,
      RazonSocial,
      CodigoPostal,
      Rfc,
      RegimenFiscal,
      State: true,
    });

    res.status(201).json({
      message: "Registro completado",
      data: newUser,
      newFacturacion,
    });
  } catch (error) {
    console.error("Error al crear cliente:", error);
    res.status(500).json({
      message: "Error al crear cliente",
      error,
    });
  }
};

export const UpdateCustomerSale = async (req: any, res: any) => {
  try {
    const {
      ID_User,
      Name,
      Phone: phoneValue,
      Email: emailValue,
      RazonSocial,
      CodigoPostal,
      Rfc,
      RegimenFiscal,
      ID_Sale,
    } = req.body;

    const user = await User.findByPk(ID_User);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    await Email.update(
      { Description: emailValue },
      { where: { ID_Email: user.ID_Email } },
    );

    await Phone.update(
      { Description: phoneValue },
      { where: { ID_Phone: user.ID_Phone } },
    );

    await User.update({ Name }, { where: { ID_User } });

    const facturacion = await Facturacion.findOne({ where: { ID_User } });
    if (facturacion) {
      await Facturacion.update(
        {
          RazonSocial,
          CodigoPostal,
          Rfc,
          RegimenFiscal,
        },
        { where: { ID_User } },
      );
    }

    const sale = await Sale.findByPk(ID_Sale);
    if (sale) {
      sale.ID_User = ID_User;
      await sale.save();
    }

    res.status(200).json({ message: "Cliente actualizado correctamente" });
  } catch (error) {
    console.error("Error al actualizar cliente:", error);
    res.status(500).json({ message: "Error al actualizar cliente", error });
  }
};

export const postCustomerSale = async (req: any, res: any) => {
  try {
    const {
      Name,
      Phone: phoneValue,
      Email: emailValue,
      RazonSocial,
      CodigoPostal,
      Rfc,
      RegimenFiscal,
      ID_Sale,
    } = req.body;

    const phone = await Phone.create({ Description: phoneValue });

    const email = await Email.create({ Description: emailValue });

    const user = await User.create({
      Name,
      ID_Rol: 2,
      ID_Phone: phone.ID_Phone,
      ID_Email: email.ID_Email,
      Imagen: "",
      Password: "",
      State: true,
    });

    await Facturacion.create({
      ID_User: user.ID_User,
      RazonSocial,
      CodigoPostal,
      Rfc,
      RegimenFiscal,
    });

    const sale = await Sale.findByPk(ID_Sale);
    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    sale.ID_User = user.ID_User;
    await sale.save();

    res.status(201).json({
      message: "Cliente creado y asignado a la venta correctamente",
      ID_User: user.ID_User,
    });
  } catch (error) {
    console.error("Error al crear cliente:", error);
    res.status(500).json({ message: "Error al crear cliente", error });
  }
};

export const getSaleById = async (req: any, res: any) => {
  try {
    const { ID_Sale } = req.params;

    if (!ID_Sale) {
      return res
        .status(400)
        .json({ success: false, message: "ID_Sale es requerido" });
    }

    const sale = await Sale.findOne({
      where: { ID_Sale },
      include: [
        {
          model: PaymentSale,
          include: [{ model: Payment }],
        },
        {
          model: SaleProduct,
          include: [{ model: Product }, { model: Stock }],
        },
        {
          model: State,
        },
        {
          model: Address,
        },
      ],
    });

    if (!sale) {
      return res
        .status(404)
        .json({ success: false, message: "Venta no encontrada" });
    }

    // Si la venta tiene un cliente (ID_User), buscar cliente y facturación
    let cliente = null;
    let facturacion = null;
    if (sale.ID_User) {
      cliente = await User.findOne({
        where: { ID_User: sale.ID_User },
        attributes: ["ID_User", "Name"],
        include: [
          {
            model: Email,
            attributes: ["ID_Email", "Description"],
          },
          {
            model: Phone,
            attributes: ["ID_Phone", "Description"],
          },
        ],
      });

      facturacion = await Facturacion.findOne({
        where: { ID_User: sale.ID_User },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...sale.toJSON(),
        Cliente: cliente,
        Facturacion: facturacion,
      },
    });
  } catch (error) {
    console.error("Error al obtener la venta:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la venta",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createPaymentSale = async (req: any, res: any) => {
  const t = await Sale.sequelize?.transaction();
  try {
    const { Payment: paymentItems, ID_Sale } = req.body;

    const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });
    if (!Number.isInteger(Number(ID_Sale)) || Number(ID_Sale) <= 0) throw fail("Folio de venta inválido");
    if (!Array.isArray(paymentItems) || paymentItems.length === 0) throw fail("Agrega al menos un pago nuevo");

    const sale = await Sale.findByPk(ID_Sale, { transaction: t, lock: t?.LOCK.UPDATE });
    if (!sale) throw fail("Venta no encontrada", 404);

    const currentBalance = Math.round(Number(sale.Balance_Total) * 100);
    if (sale.Pagada === "Pagada" || currentBalance <= 0) throw fail("La venta ya está liquidada");

    const normalizedPayments = paymentItems.map((item: any) => ({
      ID_Payment: Number(item.ID_Payment),
      MontoCents: Math.round(Number(item.Monto) * 100),
      ReferenceNumber: String(item.ReferenceNumber ?? "").trim().slice(0, 120),
    }));
    if (normalizedPayments.some((item: any) => !Number.isInteger(item.ID_Payment) || item.ID_Payment <= 0 || !Number.isInteger(item.MontoCents) || item.MontoCents <= 0)) {
      throw fail("Todos los pagos deben tener un método válido y un monto mayor a cero");
    }

    const paymentIds = [...new Set(normalizedPayments.map((item: any) => item.ID_Payment))];
    const methods = await Payment.findAll({ where: { ID_Payment: paymentIds, State: true }, transaction: t });
    if (methods.length !== paymentIds.length) throw fail("Uno de los métodos de pago no existe o está inactivo");
    const methodNames = new Map(methods.map((method) => [method.ID_Payment, method.Description]));

    const paymentTotal = normalizedPayments.reduce((sum: number, item: any) => sum + item.MontoCents, 0);
    if (paymentTotal > currentBalance) throw fail("El total de los pagos supera el saldo pendiente");

    const createdPayments = await PaymentSale.bulkCreate(normalizedPayments.map((item: any) => ({
      ID_Sale: Number(ID_Sale),
      ID_Payment: item.ID_Payment,
      Description: methodNames.get(item.ID_Payment) ?? "Pago",
      Monto: item.MontoCents / 100,
      ReferenceNumber: item.ReferenceNumber,
      State: true,
    })), { transaction: t });

    const newBalance = currentBalance - paymentTotal;
    sale.Balance_Total = newBalance / 100;
    sale.Pagada = newBalance === 0 ? "Pagada" : "Pendiente";
    await sale.save({ transaction: t });

    await t?.commit();

    res.status(201).json({
      message: newBalance === 0 ? "Venta liquidada correctamente" : "Abono registrado correctamente",
      data: { ID_Sale: sale.ID_Sale, Balance_Total: sale.Balance_Total, Pagada: sale.Pagada, payments: createdPayments },
    });
  } catch (error) {
    await t?.rollback();
    console.error("Error al crear el pago:", error);
    const status = Number((error as any)?.status) || 500;
    res.status(status).json({ message: status === 500 ? "Error al crear el pago" : (error as Error).message });
  }
};
