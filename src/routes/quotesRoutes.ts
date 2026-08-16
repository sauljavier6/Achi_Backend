// src/routes/saleRoutes.ts ✅
import { Router } from 'express';
import { createQuotes, getListQuotes, getQuotesById, searchQuotesForCheckout, updateQuotes } from '../controllers/quotesController';
import { authenticateToken } from '../middlewares/authMiddleware';
import { checkRole } from '../middlewares/checkRoleMiddleware';

const router = Router();

router.get('/', authenticateToken, checkRole("Administrador","Trabajador"), getListQuotes);
router.get('/checkout/search', authenticateToken, checkRole("Administrador","Trabajador"), searchQuotesForCheckout);
router.get("/:id", authenticateToken, checkRole("Administrador","Trabajador"), getQuotesById);
router.post('/', authenticateToken, checkRole("Administrador","Trabajador"), createQuotes);
router.put("/:id", authenticateToken, checkRole("Administrador","Trabajador"), updateQuotes);

export default router;
