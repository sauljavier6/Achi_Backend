// src/routes/rolRoutes.ts
import { Router } from 'express';
import { getProducts, getProductById, searchProducts, getProductsCatalogo, getRandomUniqueProductsByCategory} from '../../controllers/ecommerceControllers/productController';

const router = Router();

router.get('/', getProducts);
router.get('/catalogo', getProductsCatalogo);
router.get('/searchproduct/:description', searchProducts);
router.get('/:id', getProductById);
router.get('/productsbycategory/:category/:id', getRandomUniqueProductsByCategory);

export default router;  