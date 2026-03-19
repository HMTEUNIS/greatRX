export function stripRePrefix(subject: string) {
  return subject.replace(/^(\s*Re:\s*)+/i, "").trim();
}

export function parseTicketIdFromSubject(subject: string): string | null {
  const cleaned = stripRePrefix(subject);
  const match = cleaned.match(/\[#([0-9a-fA-F-]{36})\]/);
  return match?.[1] ?? null;
}

