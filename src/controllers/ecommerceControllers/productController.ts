import Category from "../../models/Category";
import ImagenProduct from "../../models/ImagenProduct";
import Iva from "../../models/Iva";
import Product from "../../models/Product";
import Stock from "../../models/Stock";
import { Op, Sequelize } from "sequelize";

export const getProductsCatalogo = async (req: any, res: any) => {
  try {
    const { category, subcategory, sortBy, page = 1, limit = 10 } = req.query;

    console.log("Obteniendo productos para catálogo con filtros:", {
      category,
      subcategory,
      sortBy,
      page,
      limit,
    });

    const offset = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (category) {
      where.ID_Category = Number(category);
    }

    if (subcategory) {
      where.ID_SubCategory = Number(subcategory);
    }

    let order: any[] = [["createdAt", "DESC"]];

    if (sortBy === "bestPrice") {
      order = [[{ model: Stock, as: "Stocks" }, "Saleprice", "ASC"]];
    } else if (sortBy === "worstPrice") {
      order = [[{ model: Stock, as: "Stocks" }, "Saleprice", "DESC"]];
    } else if (sortBy === "bestSeller") {
      order = [["SoldCount", "DESC"]];
    } else if (sortBy === "newest") {
      order = [["createdAt", "DESC"]];
    }

    const { rows: products, count } = await Product.findAndCountAll({
      include: [
        {
          model: Category,
          attributes: ["ID_Category", "Description"],
        },
        {
          model: Stock,
        },
        {
          model: ImagenProduct,
        },
      ],
      where,
      order,
      offset,
      limit: Number(limit),
      distinct: true,
    });

    const totalPages = Math.ceil(count / Number(limit));

    return res.status(200).json({
      success: true,
      data: products,
      currentPage: Number(page),
      totalPages,
      totalItems: count,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const getProducts = async (req: any, res: any) => {
  console.log("Obteniendo lista de productos con paginación");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows: products, count } = await Product.findAndCountAll({
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
        {
          model: ImagenProduct,
        },
      ],
      order: [["ID_Product", "DESC"]],
      offset,
      limit,
      distinct: true,
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      data: products,
      currentPage: page,
      totalPages,
      totalItems: count,
      hasMore: page < totalPages,
      message: "Lista de productos obtenida correctamente",
    });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

export const getProductById = async (req: any, res: any) => {
  const { id } = req.params;

  try {
    const product = await Product.findByPk(id, {
      include: [
        { model: Stock },
        { model: Category },
        { model: ImagenProduct },
        { model: Iva },
      ],
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error("Error al obtener producto:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const searchProducts = async (req: any, res: any) => {
  const { description } = req.params;

  if (!description) {
    return res.status(400).json({ message: "Debes enviar un query" });
  }

  try {
    const products = await Product.findAll({
      where: {
        Description: {
          [Op.iLike]: `%${description}%`,
        },
      },
      include: [
        {
          model: ImagenProduct,
        },
      ],
    });

    res.status(200).json(products);
  } catch (error) {
    console.error("Error al buscar productos:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const getRandomUniqueProductsByCategory = async (req: any, res: any) => {
  try {
    const { category, id } = req.params;

    if (!category) {
      return res.status(400).json({ message: "Debe enviar la categoría" });
    }

    const products = await Product.findAll({
      include: [
        {
          model: Category,
          where: { ID_Category: category },
        },
        { model: Stock },
        { model: ImagenProduct },
      ],
      order: Sequelize.literal("RANDOM()"),
      limit: 4,
    });

    res.status(200).json({
      data: products,
      message: "Productos random únicos por categoría",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};
