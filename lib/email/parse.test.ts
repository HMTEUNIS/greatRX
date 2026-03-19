import { describe, it, expect } from "vitest";
import { parseTicketIdFromSubject } from "./parse";

describe("email parse", () => {
  it("extracts uuid from bracket subject", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseTicketIdFromSubject(`Re: [#${id}] Hello`)).toBe(id);
  });

  it("returns null when no id is present", () => {
    expect(parseTicketIdFromSubject("Re: Hello world")).toBeNull();
  });
});

