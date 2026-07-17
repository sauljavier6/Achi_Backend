// src/routes/rolRoutes.ts
import { Router } from "express";
import { payment, savesale, updateSaleStatus } from '../../controllers/stripeController';

const router = Router();

router.post('/', payment);
router.post('/savesales', savesale);
router.put('/updatesalestatus', updateSaleStatus);

export default router;