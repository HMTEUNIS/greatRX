import { serve } from "https://deno.land/std/http/server.ts";
import { getSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";

type TicketRow = {
  id: string;
  organization_id: string;
  subject: string;
  description: string;
  tags: string[] | null;
};

type LocationInfo = {
  chain: string | null;
  street: string | null;
  state: string | null;
};

type Pharmacy = {
  id: number;
  address: string;
  city: string;
  state: string;
};

const SCORE_EXACT_MATCH = 10;
const SCORE_FUZZY_MATCH = 5;
const SCORE_PREFIX_BONUS = 10;
const SCORE_CITY_BONUS = 5;
const SCORE_PATTERN_MATCH = 5;
const SCORE_MULTIPLE_PATTERNS = 3;
const PHARMACY_QUERY_LIMIT = 20;
const MIN_STREET_LENGTH = 3;
const MIN_WORD_LENGTH = 3;
const MIN_TEXT_LENGTH = 3;
const MIN_WORD_LENGTH_FOR_MATCH = 3;

let medicationIndex: Map<string, number> | null = null;
let medicationIndexTimestamp = 0;
const MED_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const body = (await req.json().catch(() => null)) as
      | { ticket_id?: string; organization_id?: string; event_name?: string }
      | null;
    if (!body?.ticket_id || !body.organization_id) {
      return jsonResponse({ error: "Missing ticket_id or organization_id" }, 400);
    }

    const supabase = getSupabaseAdminClient();
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select("id, organization_id, subject, description, tags")
      .eq("id", body.ticket_id)
      .eq("organization_id", body.organization_id)
      .maybeSingle();
    if (ticketErr) throw ticketErr;
    if (!ticket) return jsonResponse({ ok: false, reason: "ticket_not_found" }, 404);

    const row = ticket as unknown as TicketRow;
    const rawText = `${row.subject ?? ""} ${row.description ?? ""}`.toLowerCase();
    const medicationText = cleanForMedication(rawText);
    const locationText = cleanForLocation(rawText);
    const locationInfo = extractLocationInfo(locationText);

    let pharmacyId: number | null = null;
    if (locationInfo.chain && locationInfo.street && locationInfo.street.length > MIN_STREET_LENGTH) {
      pharmacyId = await matchPharmacy(supabase, locationInfo, row.organization_id);
    }

    let medicationId: number | null = null;
    if (medicationText.length > MIN_TEXT_LENGTH) {
      medicationId = await matchMedication(supabase, medicationText);
    }

    const issueCategory = categorizeIssue(rawText);

    const currentTags = row.tags ?? [];
    const nextTags = upsertEnrichmentTags(currentTags, {
      pharmacyId,
      medicationId,
      issueCategory
    });

    const { error: updErr } = await supabase.from("tickets").update({ tags: nextTags }).eq("id", row.id);
    if (updErr) throw updErr;

    return jsonResponse({
      ok: true,
      ticket_id: row.id,
      pharmacy_id: pharmacyId,
      medication_id: medicationId,
      issue_category: issueCategory
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

function upsertEnrichmentTags(
  tags: string[],
  values: { pharmacyId: number | null; medicationId: number | null; issueCategory: string }
) {
  const cleaned = tags.filter(
    (t) => !/^pharmacy_id:/i.test(t) && !/^medication_id:/i.test(t) && !/^issue_category:/i.test(t)
  );
  if (values.pharmacyId != null) cleaned.push(`pharmacy_id:${values.pharmacyId}`);
  if (values.medicationId != null) cleaned.push(`medication_id:${values.medicationId}`);
  if (values.issueCategory) cleaned.push(`issue_category:${values.issueCategory}`);
  return cleaned;
}

export function cleanForMedication(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanForLocation(text: string): string {
  return text.toLowerCase().replace(/[^\w\s.,'-]/g, " ").replace(/\s+/g, " ").trim();
}

export function extractLocationInfo(text: string): LocationInfo {
  return {
    chain: extractChain(text),
    street: extractStreet(text),
    state: extractState(text) || "CA"
  };
}

export function extractChain(text: string): string | null {
  const chains = [
    { name: "cvs", patterns: ["cvs", "cvs pharmacy"] },
    { name: "walgreens", patterns: ["walgreens", "waldgreens", "walgreen"] },
    { name: "rite aid", patterns: ["rite aid", "riteaid"] },
    { name: "walmart", patterns: ["walmart", "wal-mart"] },
    { name: "kroger", patterns: ["kroger"] },
    { name: "publix", patterns: ["publix"] },
    { name: "costco", patterns: ["costco"] },
    { name: "bartells", patterns: ["bartells", "bartell drugs"] },
    { name: "giant", patterns: ["giant"] },
    { name: "safeway", patterns: ["safeway"] }
  ];
  for (const chain of chains) {
    for (const pattern of chain.patterns) {
      if (text.includes(pattern)) return chain.name;
    }
  }
  return null;
}

export function extractStreet(text: string): string | null {
  const patterns = [
    {
      regex:
        /\b(?:on|at)\s+((?:(?!\b(?:on|at)\b)[a-z]+)(?:\s+(?!(?:on|at)\b)[a-z]+)*?)\s+(?:street|st|avenue|ave|road|rd|lane|ln|highway|hwy|blvd|boulevard|drive|dr|way|place|pl)\b/i,
      group: 1
    },
    {
      regex:
        /#?\d+\s+([a-z]+(?:\s+[a-z]+)*?)\s+(?:street|st|avenue|ave|road|rd|lane|ln|highway|hwy|blvd|boulevard|drive|dr|way|place|pl)\b/i,
      group: 1
    },
    { regex: /#?\d+\s+([a-z]+(?:\s+[a-z]+)*?)(?=\s+(?:in|at|,|near|by|$))/i, group: 1 },
    {
      regex: /\b([a-z]+(?:\s+[a-z]+)*?)\s+(?:street|st|avenue|ave|road|rd|lane|ln|highway|hwy|blvd|boulevard|drive|dr|way|place|pl)\b/i,
      group: 1
    },
    { regex: /\b(?:on|at)\s+([a-z]+(?:\s+[a-z]+){0,2}?)(?=\s+(?:in|at|,|near|by|$))/i, group: 1 }
  ];

  for (const { regex, group } of patterns) {
    const match = text.match(regex);
    if (match && match[group]) {
      const street = match[group].trim();
      if (street.length > 2 && !["the", "a", "an"].includes(street.toLowerCase())) return street;
    }
  }
  return null;
}

export function extractState(text: string): string | null {
  const stateMap = new Map<string, string[]>([
    ["CA", ["ca", "california"]],
    ["TX", ["tx", "texas"]],
    ["MD", ["md", "maryland"]],
    ["AZ", ["az", "arizona"]],
    ["FL", ["fl", "florida"]],
    ["WA", ["wa", "washington"]],
    ["NY", ["ny", "new york"]],
    ["TN", ["tn", "tennessee"]]
  ]);
  for (const [state, variants] of stateMap) {
    for (const variant of variants) {
      if (new RegExp(`\\b${variant}\\b`, "i").test(text)) return state;
    }
  }
  return null;
}

async function matchPharmacy(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  info: LocationInfo,
  organizationId: string
): Promise<number | null> {
  const { chain, street, state } = info;
  if (!chain || !street || !state) return null;

  const { data, error } = await supabase
    .from("pharmacies")
    .select("id, address, city, state")
    .eq("organization_id", organizationId)
    .eq("chain_name", chain)
    .eq("state", state)
    .limit(PHARMACY_QUERY_LIMIT);

  if (error || !data || data.length === 0) return null;

  const streetWords = street
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length > MIN_WORD_LENGTH);

  const scored = (data as unknown as Pharmacy[]).map((pharm) => {
    let score = 0;
    const address = pharm.address.toLowerCase();
    for (const word of streetWords) {
      const firstMatch = kmpSearchFirst(address, word);
      if (firstMatch !== null) {
        score += SCORE_FUZZY_MATCH;
        if (firstMatch === 0) score += SCORE_PREFIX_BONUS;
      }
    }
    if (streetWords.some((w) => pharm.city.toLowerCase().includes(w))) score += SCORE_CITY_BONUS;
    return { id: pharm.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].id : null;
}

export async function matchMedication(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  text: string
): Promise<number | null> {
  const index = await getMedicationIndex(supabase);
  if (!index) return null;

  const stopwords = new Set(["the", "and", "for", "with", "from", "cvs", "walgreens", "pharmacy", "out", "of"]);
  const words = text.split(" ").filter((w) => w.length > MIN_WORD_LENGTH_FOR_MATCH && !stopwords.has(w));
  const scores = new Map<number, number>();

  for (const word of words) {
    const exactId = index.get(word);
    if (exactId) {
      scores.set(exactId, (scores.get(exactId) || 0) + SCORE_EXACT_MATCH);
      continue;
    }

    const candidates = Array.from(index.entries()).filter(
      ([term]) => term[0] === word[0] && Math.abs(term.length - word.length) <= 2
    );
    for (const [term, id] of candidates) {
      if (kmpSearchFirst(word, term) !== null) {
        scores.set(id, (scores.get(id) || 0) + SCORE_FUZZY_MATCH);
      }
    }
  }

  if (scores.size === 0) return null;
  let bestId = 0;
  let bestScore = 0;
  for (const [id, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

async function getMedicationIndex(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const now = Date.now();
  if (medicationIndex && now - medicationIndexTimestamp < MED_CACHE_TTL) return medicationIndex;

  const { data, error } = await supabase.from("medication_search_terms").select("search_term, canonical_id");
  if (error || !data) return medicationIndex;

  const idx = new Map<string, number>();
  for (const row of data as Array<{ search_term: string; canonical_id: number }>) {
    idx.set(row.search_term.toLowerCase(), row.canonical_id);
  }
  medicationIndex = idx;
  medicationIndexTimestamp = now;
  return medicationIndex;
}

export function kmpSearchFirst(text: string, pattern: string): number | null {
  const n = text.length;
  const m = pattern.length;
  if (m === 0 || n < m) return null;
  const lps = computeLPS(pattern);
  let i = 0;
  let j = 0;

  while (i < n) {
    if (pattern[j] === text[i]) {
      i++;
      j++;
    }
    if (j === m) return i - j;
    if (i < n && pattern[j] !== text[i]) {
      if (j !== 0) j = lps[j - 1];
      else i++;
    }
  }
  return null;
}

export function kmpSearch(text: string, pattern: string): number[] {
  const n = text.length;
  const m = pattern.length;
  if (m === 0 || n < m) return [];
  const lps = computeLPS(pattern);
  const result: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (pattern[j] === text[i]) {
      i++;
      j++;
    }
    if (j === m) {
      result.push(i - j);
      j = j > 0 ? lps[j - 1] : 0;
    } else if (i < n && pattern[j] !== text[i]) {
      if (j !== 0) j = lps[j - 1];
      else i++;
    }
  }
  return result;
}

export function computeLPS(pattern: string): number[] {
  const m = pattern.length;
  const lps = new Array(m).fill(0);
  let len = 0;
  let i = 1;
  while (i < m) {
    if (pattern[i] === pattern[len]) {
      len++;
      lps[i] = len;
      i++;
    } else if (len !== 0) {
      len = lps[len - 1];
    } else {
      lps[i] = 0;
      i++;
    }
  }
  return lps;
}

export function categorizeIssue(text: string): string {
  const categories = [
    { name: "PRICE_CHECK", patterns: ["price", "cost", "discount", "coupon", "how much", "expensive", "afford"] },
    {
      name: "PHARMACY_COMPLAINT",
      patterns: ["rude", "pharmacist", "wait time", "store", "staff", "unprofessional", "attitude", "customer service"]
    },
    {
      name: "MEDICATION_QUESTION",
      patterns: ["side effect", "interaction", "dosage", "take with food", "generic vs brand", "how to take"]
    },
    {
      name: "COVERAGE_ISSUE",
      patterns: ["insurance", "cover", "denied", "reject", "prior authorization", "pa", "not covered"]
    },
    { name: "ACCOUNT_ISSUE", patterns: ["login", "password", "account", "sign in", "can't log", "reset"] },
    {
      name: "MEDICATION_AVAILABILITY",
      patterns: ["out of", "backorder", "shortage", "in stock", "available", "when will"]
    }
  ];

  let bestCategory = "GENERAL";
  let highestScore = 0;
  for (const cat of categories) {
    let score = 0;
    for (const pattern of cat.patterns) {
      const matches = kmpSearch(text, pattern);
      score += matches.length * SCORE_PATTERN_MATCH;
      if (matches.length > 1) score += SCORE_MULTIPLE_PATTERNS;
    }
    if (score > highestScore) {
      highestScore = score;
      bestCategory = cat.name;
    }
  }
  return bestCategory;
}
