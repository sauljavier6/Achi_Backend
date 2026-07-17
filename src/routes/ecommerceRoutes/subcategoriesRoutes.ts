// src/routes/rolRoutes.ts
import { Router } from 'express';
import { getSubCategories } from '../../controllers/ecommerceControllers/subcategoriesController';

const router = Router();

//router.post('/', postCategory);
router.get('/', getSubCategories);

export default router;