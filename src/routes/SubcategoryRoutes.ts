// src/routes/rolRoutes.ts
import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware';
import { checkRole } from '../middlewares/checkRoleMiddleware';
import { deletesubcategory, getSubCategories, getSubCategoryById, postSubCategory, updateSubCategory } from '../controllers/SubcategoryController';

const router = Router();

router.post('/', authenticateToken, checkRole("Administrador","Trabajador"), postSubCategory);
router.get('/', authenticateToken, checkRole("Administrador","Trabajador"), getSubCategories);
router.get("/:id",authenticateToken, checkRole("Administrador","Trabajador"), getSubCategoryById);
router.put("/:id", authenticateToken, checkRole("Administrador","Trabajador"), updateSubCategory);
router.delete('/', authenticateToken, checkRole("Administrador","Trabajador"), deletesubcategory);

export default router;