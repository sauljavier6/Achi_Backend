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
      ALTER TABLE "Sale"
        ADD COLUMN IF NOT EXISTS "DocumentType" VARCHAR(10),
        ADD COLUMN IF NOT EXISTS "DocumentStatus" VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "SourceQuoteId" INTEGER,
        ADD COLUMN IF NOT EXISTS "ConvertedSaleId" INTEGER,
        ADD COLUMN IF NOT EXISTS "ConvertedAt" TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS "ConvertedBy" INTEGER,
        ADD COLUMN IF NOT EXISTS "QuoteExpiresAt" TIMESTAMPTZ
    `);
    await client.query(`
      UPDATE "Sale"
      SET
        "DocumentType" = CASE WHEN "ID_State" = 1 THEN 'QUOTE' ELSE 'SALE' END,
        "DocumentStatus" = COALESCE("DocumentStatus", 'ACTIVE'),
        "QuoteExpiresAt" = CASE
          WHEN "ID_State" = 1 THEN COALESCE("QuoteExpiresAt", "createdAt" + INTERVAL '7 days')
          ELSE NULL
        END
      WHERE "DocumentType" IS NULL OR "DocumentStatus" IS NULL OR ("ID_State" = 1 AND "QuoteExpiresAt" IS NULL)
    `);
    await client.query(`
      ALTER TABLE "Sale"
        ALTER COLUMN "DocumentType" SET NOT NULL,
        ALTER COLUMN "DocumentType" SET DEFAULT 'SALE',
        ALTER COLUMN "DocumentStatus" SET NOT NULL,
        ALTER COLUMN "DocumentStatus" SET DEFAULT 'ACTIVE'
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "sale_source_quote_unique" ON "Sale" ("SourceQuoteId") WHERE "SourceQuoteId" IS NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "quote_converted_sale_unique" ON "Sale" ("ConvertedSaleId") WHERE "ConvertedSaleId" IS NOT NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS "sale_document_type_status_idx" ON "Sale" ("DocumentType", "DocumentStatus")`);
    await client.query("COMMIT");
    console.log("Conversión cotización-venta preparada correctamente.");
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
