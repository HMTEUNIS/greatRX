import { describe, expect, it } from "vitest";
import { parseRxIdsFromTags } from "./ticket-context";

describe("parseRxIdsFromTags", () => {
  it("parses pharmacy_id and medication_id tags", () => {
    expect(
      parseRxIdsFromTags(["pharmacy_id:PH-1", "medication_id:MED-2", "other"])
    ).toEqual({ pharmacyId: "PH-1", medicationId: "MED-2" });
  });

  it("returns nulls when missing", () => {
    expect(parseRxIdsFromTags([])).toEqual({ pharmacyId: null, medicationId: null });
    expect(parseRxIdsFromTags(null)).toEqual({ pharmacyId: null, medicationId: null });
  });
});
