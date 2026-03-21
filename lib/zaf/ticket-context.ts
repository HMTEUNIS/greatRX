/**
 * GreatRX demo: pharmacy/medication identifiers carried on ticket tags.
 * Use tags like `pharmacy_id:PH-1001` and `medication_id:MED-204` on a ticket.
 */
export function parseRxIdsFromTags(tags: string[] | null | undefined): {
  pharmacyId: string | null;
  medicationId: string | null;
} {
  let pharmacyId: string | null = null;
  let medicationId: string | null = null;
  for (const raw of tags ?? []) {
    const t = raw.trim();
    const pm = t.match(/^pharmacy_id:(.+)$/i);
    if (pm?.[1]) pharmacyId = pm[1].trim();
    const mm = t.match(/^medication_id:(.+)$/i);
    if (mm?.[1]) medicationId = mm[1].trim();
  }
  return { pharmacyId, medicationId };
}
