// @/models.ts
import { Table, Model, Column, DataType, PrimaryKey, AutoIncrement, ForeignKey, BelongsTo } from "sequelize-typescript";
import Sale from "./Sale";
import Product from "./Product";
import Stock from "./Stock";

@Table({ tableName: "SaleProduct" })
export default class SaleProduct extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_SaleProduct: number;

  //relacion tabla venta
  @ForeignKey(() => Sale)
  @Column({
    type: DataType.INTEGER, 
    allowNull: false,
  })
  declare ID_Sale: number;
  
  @BelongsTo(() => Sale)
  Sale?: Sale;

  //relacion tabla producto
  @ForeignKey(() => Product)
  @Column({
    type: DataType.INTEGER, 
    allowNull: false,
  })
  declare ID_Product: number;
  
  @BelongsTo(() => Product)
  Product?: Product;

  //relacion tabla stock
  @ForeignKey(() => Stock)
  @Column({
    type: DataType.INTEGER, 
    allowNull: false,
  })
  declare ID_Stock: number;
  
  @BelongsTo(() => Stock)
  Stock?: Stock;

  @Column({
    type: DataType.INTEGER, 
    allowNull: false,
  })
  declare Quantity: number;

  @Column({
      type: DataType.DECIMAL(10, 2),
      allowNull: false,
    })
  declare Saleprice: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare ID_IvaSnapshot?: number;

  @Column({ type: DataType.STRING(120), allowNull: false, defaultValue: "Sin IVA" })
  declare TaxName: string;

  @Column({ type: DataType.DECIMAL(9, 6), allowNull: false, defaultValue: 0 })
  declare TaxRate: number;

  @Column({ type: DataType.DECIMAL(14, 6), allowNull: false, defaultValue: 0 })
  declare TaxBase: number;

  @Column({ type: DataType.DECIMAL(14, 6), allowNull: false, defaultValue: 0 })
  declare TaxAmount: number;

  @Column({ type: DataType.DECIMAL(14, 6), allowNull: false, defaultValue: 0 })
  declare TaxGross: number;

  @Column({ type: DataType.STRING(2), allowNull: false, defaultValue: "02" })
  declare TaxObject: string;

  @Column({ type: DataType.STRING(12), allowNull: false, defaultValue: "Tasa" })
  declare TaxFactor: string;

  @Column({ type: DataType.STRING(32), allowNull: false, defaultValue: "captured" })
  declare TaxSnapshotSource: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  })
  declare State: boolean;
  
}
