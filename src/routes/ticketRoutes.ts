// src/routes/saleRoutes.ts
import { Router } from "express";
import { printTicket, printTicketCotizacion, sendCotizacionByEmail, sendTicketByEmail } from "../controllers/ticketController";
import { authenticateToken } from "../middlewares/authMiddleware";
import { checkRole } from "../middlewares/checkRoleMiddleware";

const router = Router();

router.get("/cotizacion/:id", authenticateToken, checkRole("Administrador","Trabajador"), printTicketCotizacion);
router.post("/cotizacion/:id", authenticateToken, checkRole("Administrador","Trabajador"), sendCotizacionByEmail);

router.get("/:id", authenticateToken, checkRole("Administrador","Trabajador"), printTicket);
router.post("/:id", authenticateToken, checkRole("Administrador","Trabajador"), sendTicketByEmail);


export default router;
