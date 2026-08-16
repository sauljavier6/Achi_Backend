export function normalizeTaxRate(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Tasa de IVA inválida");
  return parsed > 1 ? parsed / 100 : parsed;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function extractIncludedTax(grossAmount: number, taxValue: unknown) {
  const gross = Number(grossAmount);
  if (!Number.isFinite(gross) || gross < 0) throw new Error("Importe inválido");
  const rate = normalizeTaxRate(taxValue);
  const base = rate > 0 ? gross / (1 + rate) : gross;
  return { gross, base, tax: gross - base, rate };
}

export function createTaxSnapshot(input: {
  unitPrice: number;
  quantity: number;
  taxId?: number | null;
  taxName?: string | null;
  taxValue?: unknown;
  source?: "captured" | "backfill_current_profile";
}) {
  const gross = Number(input.unitPrice) * Number(input.quantity);
  const included = extractIncludedTax(gross, input.taxValue);
  const taxName = String(input.taxName || (included.rate ? `IVA ${included.rate * 100}%` : "IVA 0%"));
  const normalizedName = taxName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const noObject = normalizedName.includes("no objeto");
  const exempt = normalizedName.includes("exent");

  return {
    ID_IvaSnapshot: input.taxId ?? null,
    TaxName: taxName,
    TaxRate: +included.rate.toFixed(6),
    TaxBase: +included.base.toFixed(6),
    TaxAmount: +included.tax.toFixed(6),
    TaxGross: +included.gross.toFixed(6),
    TaxObject: noObject ? "01" : "02",
    TaxFactor: noObject ? "No objeto" : exempt ? "Exento" : "Tasa",
    TaxSnapshotSource: input.source ?? "captured",
  };
}
