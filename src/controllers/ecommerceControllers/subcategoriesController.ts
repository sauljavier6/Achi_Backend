import { Request, Response } from 'express';
import SubCategory from '../../models/SubCategory';


export const getSubCategories = async (req: Request, res: Response) => {
  try {
    const subcategories = await SubCategory.findAll();

    res.status(200).json({
      message: 'Subcategorías obtenidas exitosamente',
      data: subcategories  ,
    });
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ message: 'Error del servidor' });
  }
};