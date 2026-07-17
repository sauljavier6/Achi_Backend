import { Request, Response } from 'express';
import { Op } from 'sequelize';
import SubCategory from '../models/SubCategory';

export const postSubCategory = async (req: Request, res: Response) => {
  const { Description, State } = req.body;

  try {
    const newSubCategory = await SubCategory.create({
      Description,
      State: State !== undefined ? State : true,
    });

    res.status(201).json({
      message: 'Subcategoría creada exitosamente',
      data: newSubCategory,
    });
  } catch (error) {
    console.error('Error al crear subcategoría:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};


export const getSubCategories = async (req: any, res: any) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const searchTerm = req.query.searchTerm || "";

    let subcategories, count;

    if (searchTerm) {
      const result = await SubCategory.findAndCountAll({
        where: {
          Description: {
            [Op.iLike]: `${searchTerm}%`,
          },
        }, 
        order: [["ID_SubCategory", "DESC"]],
        distinct: true,
      });

      subcategories = result.rows;
      count = result.count;
    } else {
      const result = await SubCategory.findAndCountAll({
        order: [["ID_SubCategory", "DESC"]],
        offset,
        limit,
        distinct: true,
      });

      subcategories = result.rows;
      count = result.count;
    }

    const totalPages = searchTerm ? 1 : Math.ceil(count / limit);

    res.status(200).json({
      data: subcategories,
      currentPage: searchTerm ? 1 : page,
      totalPages,
      totalItems: count,
      hasMore: !searchTerm && page < totalPages,
      message: "Lista de subcategorías obtenida correctamente",
    });
  } catch (error) {
    console.error("Error al obtener subcategorías:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

export const getSubCategoryById = async (req: any, res: any) => {
  try {
    const { id } = req.params;

    const subcategory = await SubCategory.findOne({
      where: {
        ID_SubCategory: id,
      },
    });

    if (!subcategory) {
      return res.status(404).json({
        message: "Subcategoría no encontrada",
      });
    }

    res.status(200).json({
      data: subcategory,
      message: "Subcategoría obtenida correctamente",
    });
  } catch (error) {
    console.error("Error al obtener subcategoría:", error);
    res.status(500).json({ message: "Error en el servidor" });
  }
};

export const updateSubCategory = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { Description, State } = req.body;

    const subcategory = await SubCategory.findByPk(id);

    if (!subcategory) {
      return res.status(404).json({
        message: "Subcategoría no encontrada",
      });
    }

    await subcategory.update({
      Description,
      State,
    });

    res.status(200).json({
      message: "Subcategoría actualizada correctamente",
      data: subcategory,
    });
  } catch (error) {
    console.error("Error al actualizar subcategoría:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

export const deletesubcategory = async (req:any, res:any) => {
  const { ids } = req.body;

  try {

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron IDs válidos' });
    }

    await SubCategory.destroy({
      where: {
        ID_SubCategory: ids
      }
    });

    res.json({ message: 'Subcategorías eliminadas correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error eliminando subcategorías' });
  }
};