import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import sequelize from "./config/database";
import indexRoutes from './routes/index';
import morgan from 'morgan';
import path from "path"; 

dotenv.config(); // Reload preview URLs whenever the development server restarts.
const FRONTEND = (process.env.FRONTEND_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);

const app = express();
app.use(morgan('dev'));
app.use(cors({
  origin(origin, callback) {
    const temporaryPreview = process.env.NODE_ENV !== "production" && origin?.endsWith(".trycloudflare.com");
    if (!origin || FRONTEND.includes(origin) || temporaryPreview) return callback(null, true);
    return callback(new Error("Origen no permitido por CORS"));
  },
  credentials: true
}));

app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use('/api', indexRoutes);
app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
app.use((err: Error, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;

sequelize.sync().then(() => {
  console.log("✅ Base de datos conectada");
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}).catch(err => console.error("❌ Error al conectar BD:", err));
