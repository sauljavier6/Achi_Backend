// src/config/database.ts
import { Sequelize } from 'sequelize-typescript';
import Rol  from '../models/Rol'; // importa tu modelo
import dotenv from 'dotenv';
import User from '../models/User';
import Email from '../models/Email';
import Product from '../models/Product';
import Stock from '../models/Stock';
import Category from '../models/Category';
import Sale from '../models/Sale';
import State from '../models/State';
import Payment from '../models/Payment';
import PaymentSale from '../models/PaymentSale';
import ProductSale from '../models/SaleProduct';
import Batch from '../models/Batch';
import Phone from '../models/Phone';
import Retiro from '../models/Retiro';
import Facturacion from '../models/Facturacion';
import Compras from '../models/Compras';
import ComprasProduct from '../models/ComprasProducts';
import PaymentCompra from '../models/paymentCompra';
import ImagenProduct from '../models/ImagenProduct';
import Iva from '../models/Iva';
import FacturacionTicket from '../models/FacturacionTicket';
import Address from '../models/Adress';
import SubCategory from '../models/SubCategory';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  models: [Rol, User, Email, Product, Stock, Category, Sale, State, Payment, PaymentSale, ProductSale, Batch, 
    Phone, Retiro, Facturacion, Compras, ComprasProduct, PaymentCompra, ImagenProduct, Iva, FacturacionTicket, 
    Address, SubCategory ], // ✅ registra los modelos aquí
  logging: false,
});

export default sequelize;
