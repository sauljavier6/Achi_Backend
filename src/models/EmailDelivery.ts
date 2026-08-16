import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";

@Table({ tableName: "EmailDelivery" })
export default class EmailDelivery extends Model {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER)
  declare ID_EmailDelivery: number;

  @Unique @Column({ type: DataType.STRING, allowNull: false })
  declare EventKey: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare Recipient: string;

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: "pending" })
  declare Status: "pending" | "processing" | "sent" | "failed";

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare Attempts: number;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare LastError: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare SentAt: Date | null;
}
