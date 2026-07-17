// server.js
import Stripe from "stripe";
import Sale from "../models/Sale";
import SaleProduct from "../models/SaleProduct";
import Stock from "../models/Stock";
import PaymentSale from "../models/PaymentSale";
import Email from "../models/Email";
import User from "../models/User";
import Phone from "../models/Phone";
import sequelize from "../config/database";
import { QueryTypes } from "sequelize";
import State from "../models/State";
import Address from "../models/Adress";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_KEY!);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-07-30.basil",
});

export const payment = async (req: any, res: any) => {
  const { amount, items, name } = req.body.datos;
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "mxn",
      metadata: {
        name: name,
        items: JSON.stringify(items),
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error creando PaymentIntent" });
  }
};

export const savesale = async (req: any, res: any) => {
  try {
    const {
      items,
      name,
      email,
      phone,
      subtotal,
      total,
      iva,
      envio,
      address,
    } = req.body.datos;

    let user = null;
    let phoneRecord = null;
    let emailRecord = await Email.findOne({ where: { Description: email } });

    if (emailRecord) {
      user = await User.findOne({ where: { ID_Email: emailRecord?.ID_Email } });
      phoneRecord = await Phone.findOne({ where: { Description: phone } });
    } else {
      emailRecord = await Email.create({
        Description: email,
        State: true,
      });

      phoneRecord = await Phone.create({
        Description: phone,
        State: true,
      });

      user = await User.create({
        Name: name || "Cliente Stripe",
        ID_Rol: 2,
        ID_Email: emailRecord.ID_Email,
        ID_Phone: phoneRecord.ID_Phone,
        Imagen: "",
        Password: "",
        State: true,
      });
    }

    const direccion = await Address.create({
      Description: address,
      State: true,
    });

    const sale = await Sale.create({
      ID_User: user ? user.ID_User : 1,
      Subtotal: subtotal,
      Total: total,
      Envio: envio,
      Iva: iva,
      Balance_Total: total,
      ID_State: 2,
      ID_Address: direccion?.ID_Address,
      ID_Operador: 1,
      Batch: "web",
      Pagada: "Pendiente",
    });

    for (const item of items) {
      await SaleProduct.create({
        ID_Sale: sale.ID_Sale,
        ID_Product: item.ID_Product,
        ID_Stock: item.ID_Stock,
        Quantity: item.Quantity,
        Saleprice: item.Saleprice,
        Iva: item.Iva,
        State: true,
      });
    }

    res.json({ message: "Venta guardada correctamente", saleId: sale.ID_Sale });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error guardando la venta" });
  }
};

export const updateSaleStatus = async (req: any, res: any) => {
  const transaction = await sequelize.transaction();

  try {
    const { saleId, paymentId, items, total } = req.body;

    if (!saleId || !paymentId) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Falta saleId o paymentId",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Items inválidos",
      });
    }

    const sale: any = await Sale.findByPk(saleId, { transaction });

    if (!sale) {
      await transaction.rollback();
      return res.status(404).json({
        message: "Venta no encontrada",
      });
    }

    if (sale.Pagada === "Pagada") {
      await transaction.rollback();
      return res.json({
        message: "La venta ya estaba pagada",
      });
    }

    for (const item of items) {
      const stock: any = await Stock.findOne({
        where: {
          ID_Stock: item.ID_Stock,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!stock) {
        await transaction.rollback();
        return res.status(404).json({
          message: `No se encontró stock para el producto ${item.ID_Product}`,
        });
      }

      const cantidadActual = Number(stock.Amount) || 0;
      const cantidadCompra = Number(item.Quantity) || 0;

      if (cantidadCompra <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Cantidad inválida en el carrito",
        });
      }

      if (cantidadActual < cantidadCompra) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Stock insuficiente para el producto ${item.ID_Product}`,
        });
      }

      await stock.update(
        {
          Amount: cantidadActual - cantidadCompra,
        },
        { transaction }
      );
    }

    await sale.update(
      {
        Pagada: "Pagada",
        PaymentIntentId: paymentId,
        Balance_Total: 0,
      },
      { transaction }
    );

    await PaymentSale.create(
      {
        ID_Sale: sale.ID_Sale,
        ID_Payment: 3,
        Description: "Pago web",
        Monto: total,
        ReferenceNumber: paymentId,
        State: true,
      },
      { transaction }
    );

    await transaction.commit();

    await sendSaleEmail(sale.ID_Sale);

    return res.json({
      message: "Estado de la venta actualizado correctamente",
    });
  } catch (error) {
    await transaction.rollback();

    console.error(error);

    return res.status(500).json({
      message: "Error al actualizar venta",
    });
  }
};

export const sendSaleEmail = async (saleId: number) => {
  try {
    const sale = await Sale.findByPk(saleId, {
      include: [{ model: PaymentSale }, { model: State }],
    });

    if (!sale) return;

    let address = null;
    address = await Address.findOne({
      where: { ID_Address: sale.ID_Address },
      attributes: ["ID_Address", "Description"],
    });

    const UserTo = await User.findOne({ where: { ID_User: sale.ID_User } });
    const DataTo = await Email.findByPk(UserTo?.ID_Email);
    const to = DataTo?.Description;

    type ProductRow = {
      Quantity: number;
      Description: string | null;
      Saleprice: number | null;
    };
    const products = await sequelize.query<ProductRow>(
      `
      SELECT sp."Quantity", p."Description", s."Saleprice"
      FROM "SaleProduct" sp
      LEFT JOIN "Product" p ON sp."ID_Product" = p."ID_Product"
      LEFT JOIN "Stock" s ON sp."ID_Stock" = s."ID_Stock"
      WHERE sp."ID_Sale" = :saleId
    `,
      {
        type: QueryTypes.SELECT,
        replacements: { saleId: saleId },
      },
    );

    const html = `
    <html>
      <head>
        <title>Ticket #${sale.ID_Sale}</title>
        <style>
          body {
            font-family: monospace;
            font-size: 11px;
            width: 260px;
            margin: 0 auto;
            padding: 6px;
            line-height: 1.2;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .small { font-size: 10px; }
          .line { border-top: 1px dashed #000; margin: 6px 0; }
          .product {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
          }
          .box {
            border: 1px dashed #000;
            padding: 4px;
            margin: 6px 0;
          }
        </style>
      </head>

      <body>
        <div class="center bold">VALENTTO MX</div>
        <div class="center">--------------------</div>
        <div class="center bold">TICKET DE VENTA</div>
        <div class="center">¡GRACIAS POR SU COMPRA!</div>
        <div class="center">--------------------</div>

        <div class="center small">ValenttoMX@gmail.com</div>
        <div class="center small">Tijuana, BC</div>
        <div class="center small">Tel: (663) 403-2690</div>

        <div class="line"></div>

        <div><strong>Venta #:</strong> ${sale.ID_Sale}</div>
        <div><strong>Fecha:</strong> ${new Date(sale.createdAt).toLocaleString()}</div>

        <div class="line"></div>

        <div class="bold">Dirección del cliente:</div>
        <div class="product">
          ${address?.Description ?? "No registrada"}
        </div>

        <div class="line"></div>

        ${products
          .map(
            (p) => `
          <div class="product">
            <span>${p.Description ?? "Producto"}</span>
            <span>${p.Quantity} x $${p.Saleprice}</span>
          </div>
        `,
          )
          .join("")}

        <div class="line"></div>

        <div class="product bold">
          <span>Subtotal</span>
          <span>$ ${sale.Subtotal}</span>
        </div>

        <div class="product">
          <span>IVA</span>
          <span>$ ${sale.Iva}</span>
        </div>
        

        <div class="product bold">
          <span>TOTAL</span>
          <span>$ ${sale.Total}</span>
        </div>


        <div class="line"></div>

        <div class="center small">Conserve este ticket como comprobante</div>
        <div class="center bold">¡Gracias por su preferencia!</div>

      </body>
    </html>
    `;

    // Configura el transporte
    await resend.emails.send({
      from: "ValenttoMX <ValenttoMX@valenttomx.com>",
      to: to!,
      subject: `Ticket de venta #${sale.ID_Sale}`,
      html,
    });
  } catch (error) {
    console.error("Error al enviar ticket:", error);
  }
};
