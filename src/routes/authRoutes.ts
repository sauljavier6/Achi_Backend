// src/routes/authRoutes.ts
import express from 'express';
import { register, login } from '../controllers/authController';
import { uploadProfile } from '../middlewares/uploadProfile';
import { resizeProfileImage } from '../middlewares/resizeImagesProfile';
import { authRateLimit } from '../middlewares/rateLimitMiddleware';

const router = express.Router();

router.post('/register', authRateLimit, uploadProfile, resizeProfileImage, register);
router.post('/login', authRateLimit, login);

export default router;

