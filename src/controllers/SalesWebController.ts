// @/controllers/SaleController.ts
import Address from "../models/Adress";
import Email from "../models/Email";
import Payment from "../models/Payment";
import PaymentSale from "../models/PaymentSale";
import Phone from "../models/Phone";
import Product from "../models/Product";
import Sale from "../models/Sale";
import { formatPublicFolio } from "../utils/publicFolio";
import SaleProduct from "../models/SaleProduct";
import State from "../models/State";
import Stock from "../models/Stock";
import User from "../models/User";
import PDFDocument from "pdfkit";

const formatDateTime = (date: Date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

export const getListSaleWeb = async (req: any, res: any) => {
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
          Batch: "web",
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
        where: {
          ID_State: 2,
          Batch: "web",
          StateWeb: true,
        },
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
      })
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

export const printRemision = async (req: any, res: any) => {
  try {
    const { ID_Sale } = req.params;

    const sale = await Sale.findOne({
      where: { ID_Sale },
      include: [
        { model: PaymentSale, include: [{ model: Payment }] },
        { model: SaleProduct, include: [{ model: Product }, { model: Stock }] },
        { model: State },
      ],
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    const saleJson = JSON.parse(JSON.stringify(sale));

    let cliente = null;
    let address = null;
    if (sale.ID_User) {
      cliente = await User.findOne({
        where: { ID_User: sale.ID_User },
        attributes: ["ID_User", "Name"],
        include: [
          { model: Email, attributes: ["Description"] },
          { model: Phone, attributes: ["Description"] },
        ],
      });

      address = await Address.findOne({
        where: { ID_Address: sale.ID_Address },
        attributes: ["ID_Address", "Description"],
      });
    }

    // 🎨 Colores corporativos
    const primaryColor = "#C70063";
    const secondaryColor = "#007782";
    const lightGray = "#E8EDF2";
    const darkGray = "#1E293B";

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=remision_${ID_Sale}.pdf`
    );

    doc.pipe(res);

    // -----------------------------------------------------
    // 🟦 ENCABEZADO
    // -----------------------------------------------------
    doc
      .fillColor(primaryColor)
      .fontSize(22)
      .text("ACHI VETERINARIA", { align: "left" });

    doc.moveDown(0.3);

    doc
      .fontSize(10)
      .fillColor(darkGray)
      .text("REMISION DE PEDIDO", { align: "left" })
      .text("Achi Veterinaria | Tijuana, BC", {
        align: "center",
      })
      .text("Tijuana, B.C.", { align: "center" });

    doc.moveDown(1.2);

    // Línea divisoria
    doc
      .strokeColor(primaryColor)
      .lineWidth(2)
      .moveTo(40, doc.y)
      .lineTo(550, doc.y)
      .stroke();

    doc.moveDown();

    // -----------------------------------------------------
    // 📦 DATOS DE LA VENTA
    // -----------------------------------------------------
    doc
      .fontSize(14)
      .fillColor(primaryColor)
      .text("Datos del pedido");

    doc.moveDown(0.5);

    doc.fillColor(darkGray).fontSize(11);
    doc.text(`Folio del pedido: ${formatPublicFolio(sale, "order")}`);
    doc.text(`Fecha: ${formatDateTime(sale.createdAt)}`);
    doc.text(`Cliente: ${cliente?.Name || "Público General"}`);
    doc.text(`Correo: ${cliente?.Email?.Description || "No registrado"}`);
    doc.text(`Teléfono: ${cliente?.Phone?.Description || "No registrado"}`);
    doc.text(`Dirección: ${address?.Description || "No registrada"}`);

    doc.moveDown();

    // -----------------------------------------------------
    // 🧪 TABLA DE PRODUCTOS (ALINEACIÓN PERFECTA)
    // -----------------------------------------------------
    doc
      .fontSize(14)
      .fillColor(primaryColor)
      .text("Productos a entregar");

    doc.moveDown(0.7);

    // POSICIONES FIJAS PARA LA TABLA
    const colDesc = 40;
    const colCant = 300;
    const colPrecio = 360;
    const colTotal = 430;

    // Encabezados TODOS en la MISMA línea
    const tableHeaderY = doc.y;

    doc.rect(40, tableHeaderY - 5, 510, 24).fill("#F1F5F9");
    doc.fontSize(10).fillColor(darkGray);
    doc.text("Descripción", colDesc, tableHeaderY);
    doc.text("Cant.", colCant, tableHeaderY);
    doc.text("Precio", colPrecio, tableHeaderY);
    doc.text("Total", colTotal, tableHeaderY);

    // Línea del encabezado
    let y = tableHeaderY + 20;

    doc
      .strokeColor(lightGray)
      .lineWidth(1)
      .moveTo(40, tableHeaderY + 15)
      .lineTo(550, tableHeaderY + 15)
      .stroke();

    // Filas
    saleJson.SaleProduct.forEach((item: any, index: number) => {
      const subtotal = item.Quantity * parseFloat(item.Stock.Saleprice);

      // Evitar desbordamiento de página
      if (y > 720) {
        doc.addPage();
        y = 50;
      }

      if (index % 2 === 1) doc.rect(40, y - 3, 510, 20).fill("#FAFAFC");
      doc.fontSize(10).fillColor(darkGray);

      // Descripción con ancho limitado
      doc.text(
        `${item.Product.Description} ${item.Stock.Description}`,
        colDesc,
        y,
        { width: 240 }
      );

      doc.text(item.Quantity.toString(), colCant, y);
      doc.text(`$${parseFloat(item.Stock.Saleprice).toFixed(2)}`, colPrecio, y);
      doc.text(`$${subtotal.toFixed(2)}`, colTotal, y);

      y += 20;

      // Evitar que se salga de la página
      if (y > 720) {
        doc.addPage();
        y = 50;
      }
    });

    doc.y = y + 18;

    // -----------------------------------------------------
    // 💰 TOTAL Y SUBTOTAL
    // -----------------------------------------------------
    doc
      .fontSize(14)
      .fillColor(darkGray)
      .text(`SUBTOTAL: $${sale.Subtotal}`, { align: "right" });
    doc
      .fontSize(14)
      .fillColor(darkGray)
      .text(`IVA INCLUIDO: $${sale.Iva}`, { align: "right" });
    doc
      .fontSize(14)
      .fillColor(darkGray)
      .text(`ENVÍO: $${sale.Envio}`, { align: "right" });
    doc
      .fontSize(14)
      .fillColor(secondaryColor)
      .text(`TOTAL: $${sale.Total}`, { align: "right" });

    doc.moveDown(2);

    // -----------------------------------------------------
    // 🦶 FOOTER
    // -----------------------------------------------------
    doc
      .fontSize(10)
      .fillColor(darkGray)
      .text("Documento de entrega - Achi Veterinaria", {
        align: "center",
      });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al generar PDF" });
  }
};

export const disableStateWebSale = async (req: any, res: any) => {
  try {
    const { ID_Sale } = req.params;

    // Buscar venta
    const sale = await Sale.findOne({ where: { ID_Sale } });

    if (!sale) {
      return res.status(404).json({
        message: "Venta no encontrada",
      });
    }

    // Cambiar solo el campo StateWeb
    await sale.update({ StateWeb: false });

    return res.status(200).json({
    success: true,
    message: "StateWeb actualizado a false correctamente",
    data: {
        ID_Sale,
        StateWeb: false,
    },
    });


  } catch (error) {
    console.error("Error al actualizar StateWeb:", error);
    return res.status(500).json({
      message: "Error al actualizar StateWeb",
    });
  }
};
