require("dotenv").config();
const { Client } = require("pg");

async function migrate() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE "SaleProduct"
        ADD COLUMN IF NOT EXISTS "ID_IvaSnapshot" INTEGER,
        ADD COLUMN IF NOT EXISTS "TaxName" VARCHAR(120),
        ADD COLUMN IF NOT EXISTS "TaxRate" DECIMAL(9,6),
        ADD COLUMN IF NOT EXISTS "TaxBase" DECIMAL(14,6),
        ADD COLUMN IF NOT EXISTS "TaxAmount" DECIMAL(14,6),
        ADD COLUMN IF NOT EXISTS "TaxGross" DECIMAL(14,6),
        ADD COLUMN IF NOT EXISTS "TaxObject" VARCHAR(2),
        ADD COLUMN IF NOT EXISTS "TaxFactor" VARCHAR(12),
        ADD COLUMN IF NOT EXISTS "TaxSnapshotSource" VARCHAR(32)
    `);
    await client.query(`
      UPDATE "SaleProduct" sp
      SET
        "ID_IvaSnapshot" = p."ID_Iva",
        "TaxName" = COALESCE(i."Description", 'IVA 0%'),
        "TaxRate" = CASE
          WHEN COALESCE(i."Iva", 0) > 1 THEN i."Iva" / 100.0
          ELSE COALESCE(i."Iva", 0)
        END,
        "TaxGross" = ROUND((sp."Saleprice" * sp."Quantity")::numeric, 6),
        "TaxBase" = ROUND((
          (sp."Saleprice" * sp."Quantity") /
          (1 + CASE WHEN COALESCE(i."Iva", 0) > 1 THEN i."Iva" / 100.0 ELSE COALESCE(i."Iva", 0) END)
        )::numeric, 6),
        "TaxAmount" = ROUND((
          (sp."Saleprice" * sp."Quantity") -
          ((sp."Saleprice" * sp."Quantity") /
          (1 + CASE WHEN COALESCE(i."Iva", 0) > 1 THEN i."Iva" / 100.0 ELSE COALESCE(i."Iva", 0) END))
        )::numeric, 6),
        "TaxObject" = CASE WHEN LOWER(COALESCE(i."Description", '')) LIKE '%no objeto%' THEN '01' ELSE '02' END,
        "TaxFactor" = CASE
          WHEN LOWER(COALESCE(i."Description", '')) LIKE '%no objeto%' THEN 'No objeto'
          WHEN LOWER(COALESCE(i."Description", '')) LIKE '%exent%' THEN 'Exento'
          ELSE 'Tasa'
        END,
        "TaxSnapshotSource" = 'backfill_current_profile'
      FROM "Product" p
      LEFT JOIN "Iva" i ON i."ID_Iva" = p."ID_Iva"
      WHERE p."ID_Product" = sp."ID_Product"
        AND sp."TaxSnapshotSource" IS NULL
    `);
    await client.query(`
      UPDATE "SaleProduct"
      SET
        "TaxName" = COALESCE("TaxName", 'IVA desconocido'),
        "TaxRate" = COALESCE("TaxRate", 0),
        "TaxBase" = COALESCE("TaxBase", ROUND(("Saleprice" * "Quantity")::numeric, 6)),
        "TaxAmount" = COALESCE("TaxAmount", 0),
        "TaxGross" = COALESCE("TaxGross", ROUND(("Saleprice" * "Quantity")::numeric, 6)),
        "TaxObject" = COALESCE("TaxObject", '02'),
        "TaxFactor" = COALESCE("TaxFactor", 'Tasa'),
        "TaxSnapshotSource" = COALESCE("TaxSnapshotSource", 'backfill_current_profile')
    `);
    await client.query(`
      ALTER TABLE "SaleProduct"
        ALTER COLUMN "TaxName" SET NOT NULL,
        ALTER COLUMN "TaxRate" SET NOT NULL,
        ALTER COLUMN "TaxBase" SET NOT NULL,
        ALTER COLUMN "TaxAmount" SET NOT NULL,
        ALTER COLUMN "TaxGross" SET NOT NULL,
        ALTER COLUMN "TaxObject" SET NOT NULL,
        ALTER COLUMN "TaxFactor" SET NOT NULL,
        ALTER COLUMN "TaxSnapshotSource" SET NOT NULL,
        ALTER COLUMN "TaxName" SET DEFAULT 'Sin IVA',
        ALTER COLUMN "TaxRate" SET DEFAULT 0,
        ALTER COLUMN "TaxBase" SET DEFAULT 0,
        ALTER COLUMN "TaxAmount" SET DEFAULT 0,
        ALTER COLUMN "TaxGross" SET DEFAULT 0,
        ALTER COLUMN "TaxObject" SET DEFAULT '02',
        ALTER COLUMN "TaxFactor" SET DEFAULT 'Tasa',
        ALTER COLUMN "TaxSnapshotSource" SET DEFAULT 'captured'
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "sale_product_tax_rate_idx" ON "SaleProduct" ("TaxRate")`);
    await client.query(`CREATE INDEX IF NOT EXISTS "sale_product_iva_snapshot_idx" ON "SaleProduct" ("ID_IvaSnapshot")`);
    await client.query("COMMIT");
    console.log("Snapshot fiscal agregado y registros históricos conciliados.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
