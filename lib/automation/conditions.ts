export type TicketLike = {
  status: string;
  priority: string;
  assignee_id: string | null;
  tags: string[] | null | undefined;
};

function normalizeToArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === "string");
  if (typeof val === "string") return [val];
  return [];
}

export function conditionMatches(condition: unknown, ticket: TicketLike): boolean {
  if (!condition || typeof condition !== "object") return false;
  const c = condition as any;
  const tags = ticket.tags ?? [];

  const status = c.status ? normalizeToArray(c.status) : null;
  if (status && !status.includes(ticket.status)) return false;

  const priority = c.priority ? normalizeToArray(c.priority) : null;
  if (priority && !priority.includes(ticket.priority)) return false;

  if (c.assignee_id) {
    if (typeof c.assignee_id !== "string") return false;
    if (ticket.assignee_id !== c.assignee_id) return false;
  }

  const tagsContainsAll = Array.isArray(c.tags_contains_all) ? c.tags_contains_all : null;
  if (tagsContainsAll && tagsContainsAll.length > 0) {
    for (const t of tagsContainsAll) {
      if (typeof t !== "string") return false;
      if (!tags.includes(t)) return false;
    }
  }

  const tagsContainsAny = Array.isArray(c.tags_contains_any) ? c.tags_contains_any : null;
  if (tagsContainsAny && tagsContainsAny.length > 0) {
    const any = tagsContainsAny.some((t: unknown) => typeof t === "string" && tags.includes(t));
    if (!any) return false;
  }

  return true;
}

