// src/routes/rolRoutes.ts
import { Router } from 'express';
import { getProducts, postProducts, deleteproducts, getProductById, updateProduct } from '../controllers/ProductController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { upload } from '../middlewares/upload';
import { resizeImages } from '../middlewares/resizeImages';
import { checkRole } from '../middlewares/checkRoleMiddleware';

const router = Router();

router.get('/', authenticateToken, checkRole("Administrador","Trabajador"), getProducts);
router.get('/:id', authenticateToken, checkRole("Administrador","Trabajador"), getProductById);
router.post("/", authenticateToken, checkRole("Administrador","Trabajador"), upload.array("Imagenes", 5), resizeImages, postProducts);
router.delete('/', authenticateToken, checkRole("Administrador","Trabajador"), deleteproducts);
router.put('/', authenticateToken, checkRole("Administrador","Trabajador"), upload.array("Imagenes", 5), resizeImages, updateProduct);

export default router; 
