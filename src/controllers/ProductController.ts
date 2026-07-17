import Product from "../models/Product";
import Stock from "../models/Stock";
import Category from "../models/Category";
import { Op } from "sequelize";
import ImagenProduct from "../models/ImagenProduct";
import fs from "fs";
import path from "path";

interface StockItem {
  ID_Stock?: number;
  Description: string;
  Amount: number;
  Saleprice: number;
  Purchaseprice: number;
  State?: boolean;
}

export const getProducts = async (req: any, res: any) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.searchTerm || "";

    let products, count;

    if (searchTerm) {
      const result = await Product.findAndCountAll({
        where: {
          Description: {
            [Op.iLike]: `${searchTerm}%`,
          },
        },
        include: [
          {
            model: Category,
            attributes: ["ID_Category", "Description"],
          },
          {
            model: Stock,
            attributes: [
              "ID_Stock",
              "Description",
              "Amount",
              "Saleprice",
              "Purchaseprice",
            ],
          },
        ],
        order: [["ID_Product", "DESC"]],
        distinct: true,
      });

      products = result.rows;
      count = result.count;
    } else {
      // ✅ Traer con paginación normal
      const result = await Product.findAndCountAll({
        include: [
          {
            model: Category,
            attributes: ["ID_Category", "Description"],
          },
          {
            model: Stock,
            attributes: [
              "ID_Stock",
              "Description",
              "Amount",
              "Saleprice",
              "Purchaseprice",
            ],
          },
        ],
        order: [["ID_Product", "DESC"]],
        offset,
        limit,
        distinct: true,
      });

      products = result.rows;
      count = result.count;
    }

    const totalPages = searchTerm ? 1 : Math.ceil(count / limit);

    res.status(200).json({
      data: products,
      currentPage: searchTerm ? 1 : page,
      totalPages,
      totalItems: count,
      hasMore: !searchTerm && page < totalPages,
      message: "Lista de productos obtenida correctamente",
    });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

export const postProducts = async (req: any, res: any) => {
  try {
    const {
      Description,
      ID_Category,
      ID_SubCategory,
      Code,
      Codesat,
      StockData,
      Imagenes,
      ID_Iva,
    } = req.body;

    const stock = JSON.parse(StockData);

    const newProduct = await Product.create({
      Description,
      ID_Category,
      ID_SubCategory,
      Code,
      Codesat,
      ID_Iva,
      State: true,
    });

    if (Array.isArray(stock)) {
      await Promise.all(
        stock.map((stock) =>
          Stock.create({
            ...stock,
            ID_Product: newProduct.ID_Product,
            State: stock.State ?? true,
          }),
        ),
      );
    }

    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      await Promise.all(
        files.map((file) =>
          ImagenProduct.create({
            ID_Product: newProduct.ID_Product,
            Imagen: file.filename,
            State: true,
          }),
        ),
      );
    }

    res.status(201).json({
      message: "Producto, stock e imágenes registrados correctamente",
      data: newProduct,
    });
  } catch (error) {
    console.error("Error al crear producto:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const deleteproducts = async (req: any, res: any) => {
  const { ids } = req.body;

  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ message: "No se proporcionaron IDs válidos" });
    }

    await Product.destroy({
      where: {
        ID_Product: ids,
      },
    });

    res.json({ message: "Productos eliminados correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error eliminando productos" });
  }
};

export const getProductById = async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const product = await Product.findByPk(id, {
      include: [{ model: Stock }, { model: Category }],
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const imagenes = await ImagenProduct.findAll({
      where: { ID_Product: id },
    });

    const imagenesArray = imagenes.map((img) => img.Imagen).filter(Boolean);

    const productWithImages = {
      ...product.toJSON(),
      Iva: Number(product.Iva),
      Imagenes: imagenesArray,
    };

    res.status(200).json(productWithImages);
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

const uploadDir = path.join(__dirname, "../../uploads/products");

export const deleteFile = (fileName: string) => {
  if (!fileName) return;

  const filePath = path.join(uploadDir, fileName);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (!err) {
      fs.unlink(filePath, (err) => {
        if (err) console.error("Error al borrar archivo:", err);
      });
    }
  });
};

export const updateProduct = async (req: any, res: any) => {
  try {
    const {
      ID_Product,
      Description,
      ID_Category,
      ID_SubCategory,
      Code,
      Codesat,
      State,
      StockData,
      ID_Iva,
    } = req.body;

    console.log("Datos recibidos para actualizar:", {
      ID_Product,
      Description,
      ID_Category,
      ID_SubCategory,
      Code,
      Codesat,
      State,
      StockData,
      ID_Iva,
    });

    const parsedStockData = JSON.parse(StockData);

    const product = await Product.findByPk(ID_Product, {
      include: [Stock, ImagenProduct],
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    await product.update({
      Description,
      ID_Category,
      ID_SubCategory,
      Code,
      Codesat,
      ID_Iva,
      State: State === "true",
    });

    const stockIdsFromClient = parsedStockData
      .filter((s: any) => s.ID_Stock)
      .map((s: any) => s.ID_Stock);

    const existingStocks = await Stock.findAll({
      where: { ID_Product: product.ID_Product },
    });

    for (const stock of existingStocks) {
      if (!stockIdsFromClient.includes(stock.ID_Stock)) {
        await stock.destroy();
      }
    }

    for (const stockItem of parsedStockData) {
      if (stockItem.ID_Stock) {
        const existing = await Stock.findByPk(stockItem.ID_Stock);
        if (existing) {
          await existing.update({
            Description: stockItem.Description,
            Amount: stockItem.Amount,
            Saleprice: stockItem.Saleprice,
            Purchaseprice: stockItem.Purchaseprice,
            State: stockItem.State ?? true,
          });
        }
      } else {
        await Stock.create({
          ...stockItem,
          ID_Product: product.ID_Product,
          State: stockItem.State ?? true,
        });
      }
    }

    const files = req.files as Express.Multer.File[];
    const existingImages: string[] = req.body.ExistingImages || [];

    const imagenesActuales = await ImagenProduct.findAll({
      where: { ID_Product: product.ID_Product },
    });

    for (const img of imagenesActuales) {
      if (!existingImages.includes(img.Imagen)) {
        deleteFile(img.Imagen);
        await img.destroy();
      }
    }

    if (files && files.length > 0) {
      const nuevasImagenes = files.map((file) => ({
        ID_Product: product.ID_Product,
        Imagen: file.filename,
        State: true,
      }));

      await ImagenProduct.bulkCreate(nuevasImagenes);
    }

    res.status(200).json({
      message: "Producto y stocks actualizados correctamente",
      data: await Product.findByPk(ID_Product, {
        include: [Stock, ImagenProduct],
      }),
    });
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const searchProducts = async (req: any, res: any) => {
  const { q } = req.query;

  try {
    if (!isNaN(Number(q))) {
      const product = await Product.findOne({
        where: { ID_Product: Number(q) },
        include: [Stock, Category],
      });
      return res.json(product ? [product] : []);
    }

    const products = await Product.findAll({
      where: {
        [Op.or]: [
          { Description: { [Op.iLike]: `%${q}%` } },
          { Code: { [Op.iLike]: `%${q}%` } },
        ],
      },
      include: [Stock, Category],
    });

    res.json(products);
  } catch (error) {
    console.error("Error al buscar productos:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};
