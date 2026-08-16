export type PublicFolioKind = "sale" | "quote" | "order";

export function formatPublicFolio(
  record: { ID_Sale: number | string; createdAt?: Date | string | null },
  _kind: PublicFolioKind = "sale",
) {
  return String(record.ID_Sale).padStart(6, "0");
}
