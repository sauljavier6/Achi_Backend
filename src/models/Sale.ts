// @/models.ts
import {
  Table,
  Model,
  Column,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
} from "sequelize-typescript";
import State from "./State";
import PaymentSale from "./PaymentSale";
import SaleProduct from "./SaleProduct";
import FacturacionTicket from "./FacturacionTicket";
import Address from "./Adress";

@Table({ tableName: "Sale" })
export default class Sale extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
  })
  declare ID_Sale: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: true,
  })
  declare ID_User: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
  })
  declare Total: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
  })
  declare Balance_Total: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
  })
  declare Subtotal: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
  })
  declare Envio: number;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
  })
  declare Iva: number;

  //relacion tabla tipo registro
  @ForeignKey(() => State)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare ID_State: number;

  @BelongsTo(() => State)
  State?: State;

  // relación tabla dirección de la venta
  @ForeignKey(() => Address)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1, // o un ID específico si quieres
  })
  declare ID_Address?: number;

  @BelongsTo(() => Address)
  Address?: Address;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare ID_Operador: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare Batch: string;

  @Column({
    type: DataType.ENUM("Pagada", "Pendiente"),
    allowNull: false,
    defaultValue: "Pendiente",
  })
  declare Pagada: "Pagada" | "Pendiente";

  @Column({ type: DataType.STRING(10), allowNull: false, defaultValue: "SALE" })
  declare DocumentType: "SALE" | "QUOTE";

  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "ACTIVE" })
  declare DocumentStatus: "ACTIVE" | "CONVERTED" | "CANCELLED" | "EXPIRED";

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare SourceQuoteId?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare ConvertedSaleId?: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare ConvertedAt?: Date | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare ConvertedBy?: number | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare QuoteExpiresAt?: Date | null;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  })
  declare StateWeb: boolean;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  })
  declare StateSale: boolean;

  @HasMany(() => PaymentSale)
  PaymentSale?: PaymentSale[];

  @HasMany(() => SaleProduct)
  SaleProduct?: SaleProduct[];

  @HasMany(() => FacturacionTicket)
  FacturacionTicket?: FacturacionTicket[];
}
