import { Router } from "express";
import { createCheckout, mercadoPagoWebhook, reconcileMercadoPagoPayment } from "../../controllers/mercadoPagoController";
import { authRateLimit } from "../../middlewares/rateLimitMiddleware";

const router = Router();
router.post("/checkout", authRateLimit, (req, res, next) => { void createCheckout(req, res).catch(next); });
router.post("/webhook", (req, res, next) => { void mercadoPagoWebhook(req, res).catch(next); });
router.post("/reconcile", authRateLimit, (req, res, next) => { void reconcileMercadoPagoPayment(req, res).catch(next); });
export default router;
