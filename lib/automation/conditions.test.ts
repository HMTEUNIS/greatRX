import { describe, it, expect } from "vitest";
import { conditionMatches } from "./conditions";

describe("automation conditionMatches", () => {
  it("matches status priority and tags_contains_all", () => {
    const ticket = { status: "open", priority: "urgent", assignee_id: "a", tags: ["automation", "sla"] };
    expect(
      conditionMatches(
        { status: "open", priority: "urgent", tags_contains_all: ["automation"] },
        ticket
      )
    ).toBe(true);
  });

  it("fails when required tag missing", () => {
    const ticket = { status: "open", priority: "urgent", assignee_id: "a", tags: ["automation"] };
    expect(
      conditionMatches(
        { status: "open", tags_contains_all: ["automation", "sla"] },
        ticket
      )
    ).toBe(false);
  });
});

