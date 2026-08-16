import { Request, Response } from 'express';
import Category from '../models/Category';
import { Op } from 'sequelize';

export const postCategory = async (req: Request, res: Response) => {
  const { Description, State } = req.body;
  const normalizedState = State === undefined ? true : State === true || State === 'true' || State === 'Activo';

  try {
    const newCategory = await Category.create({
      Description,
      State: normalizedState,
    });

    res.status(201).json({
      message: 'Categoría creada exitosamente',
      data: newCategory,
    });
  } catch (error) {
    console.error('Error al crear categoría:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


export const getCategories = async (req: any, res: any) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.searchTerm || "";

    let categories, count;

    if (searchTerm) {
      const result = await Category.findAndCountAll({
        where: {
          Description: {
            [Op.iLike]: `${searchTerm}%`,
          },
        }, 
        order: [["ID_Category", "DESC"]],
        distinct: true,
      });

      categories = result.rows;
      count = result.count;
    } else {
      const result = await Category.findAndCountAll({
        order: [["ID_Category", "DESC"]],
        offset,
        limit,
        distinct: true,
      });

      categories = result.rows;
      count = result.count;
    }

    const totalPages = searchTerm ? 1 : Math.ceil(count / limit);

    res.status(200).json({
      data: categories,
      currentPage: searchTerm ? 1 : page,
      totalPages,
      totalItems: count,
      hasMore: !searchTerm && page < totalPages,
      message: "Lista de categorías obtenida correctamente",
    });
  } catch (error) {
    console.error("Error al obtener categorías:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

export const getCategoryById = async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const category = await Category.findOne({
      where: {
        ID_Category: id,
      },
    });

    if (!category) {
      return res.status(404).json({
        message: "Categoría no encontrada",
      });
    }

    res.status(200).json({
      data: category,
      message: "Categoría obtenida correctamente",
    });
  } catch (error) {
    console.error("Error al obtener categoría:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

export const updateCategory = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { Description, State } = req.body;
    const normalizedState = State === true || State === 'true' || State === 'Activo';

    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({
        message: "Categoría no encontrada",
      });
    }

    await category.update({
      Description,
      State: normalizedState,
    });

    res.status(200).json({
      message: "Categoría actualizada correctamente",
      data: category,
    });
  } catch (error) {
    console.error("Error al actualizar categoría:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};


export const deletecategory = async (req:any, res:any) => {
  const { ids } = req.body;

  try {

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron IDs válidos' });
    }

    await Category.destroy({
      where: {
        ID_Category: ids
      }
    });

    res.json({ message: 'Categorias eliminadas correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error eliminando categorias' });
  }
};
