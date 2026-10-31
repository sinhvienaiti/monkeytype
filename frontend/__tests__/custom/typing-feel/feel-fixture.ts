import catalogueJson from "./fixtures/typing-feel-catalogue.json";

/**
 * A sample Typing Feel host for the tests: the catalogue is a copy of the
 * parent repo's typing-feel/public/v1/keys/keys-manifest.json, revision r1
 * (34 sets in seven families, owner 30/10/2026). Set manifests are made from
 * its rows; no audio exists, so every OGG is a 404. The real catalogue is not
 * in this repo: the tests run on a plain clone.
 */
export type CatalogueRow = {
  id: string;
  name: string;
  family: string;
  order: number;
  score: number | null;
  ownerPick: boolean;
  keys: number;
  spaces: number;
  manifest: string;
  preview: string;
};
export type Catalogue = {
  schema: string;
  revision: string;
  default: string;
  effects: Record<string, unknown>;
  profiles: CatalogueRow[];
};

export const FEEL_URL = "https://feel.test";
export const BASE = `${FEEL_URL}/v1/keys/`;
export const CATALOGUE_URL = `${BASE}keys-manifest.json`;

export function sampleCatalogue(): Catalogue {
  return structuredClone(catalogueJson);
}

/** The owner's order (30/10/2026): picks close their family. */
export const FAMILIES: readonly (readonly [string, readonly string[]])[] = [
  ["Deep", ["deep", "deep-amber", "deep-cedar"]],
  [
    "Warm",
    [
      "warm",
      "warm-amber",
      "warm-cedar",
      "warm-pebble",
      "warm-slate",
      "warm-silk",
    ],
  ],
  ["Rounded", ["rounded"]],
  ["Solid", ["solid", "solid-amber", "hail-stone"]],
  [
    "Crisp",
    [
      "crisp",
      "crisp-amber",
      "crisp-cedar",
      "crisp-pebble",
      "crisp-slate",
      "crisp-silk",
      "raindrop-tile",
    ],
  ],
  ["Clear", ["clear", "clear-amber", "clear-cedar", "clear-pebble"]],
  [
    "Bright Clack",
    [
      "bright-clack",
      "bright-clack-amber",
      "bright-clack-cedar",
      "bright-clack-pebble",
      "bright-clack-slate",
      "bright-clack-silk",
      "bright-clack-copper",
      "bright-clack-walnut",
      "bright-clack-moss",
      "bright-clack-ember",
    ],
  ],
];
export const ALL = FAMILIES.flatMap(([, ids]) => ids);

const number2 = (n: number): string => String(n).padStart(2, "0");

/** The set-1 manifest of a catalogue row. */
export function setManifest(row: CatalogueRow): unknown {
  return {
    schema: "typing-feel/set-1",
    id: row.id,
    name: row.name,
    licence: "test",
    recipe: "natural-v1",
    files: [
      ...Array.from({ length: row.keys }, (_, i) => ({
        file: `key-${number2(i + 1)}.ogg`,
        set: "key",
        durationMs: 400,
      })),
      ...Array.from({ length: row.spaces }, (_, i) => ({
        file: `space-${number2(i + 1)}.ogg`,
        set: "space",
        durationMs: 500,
      })),
    ],
    preview: "preview.ogg",
  };
}

export type Reply = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export function reply(
  status: number,
  body: unknown,
  type = "application/json",
): Reply {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => (name.toLowerCase() === "content-type" ? type : null),
    },
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

export type FeelHost = {
  /** The catalogue body; default: the sample. */
  readonly catalogue?: unknown;
  /** Every request fails as a network error (host down, CORS). */
  readonly down?: boolean;
  /** Set ids whose manifest answers 503. */
  readonly broken?: readonly string[];
};

/** fetch for the sample host at BASE: the catalogue, set manifests from its rows, 404 for anything else. */
export function feelFetch(
  host: FeelHost = {},
): (url: string, init?: RequestInit) => Promise<Reply> {
  const catalogue = host.catalogue ?? sampleCatalogue();
  const rows =
    catalogue !== null &&
    typeof catalogue === "object" &&
    Array.isArray((catalogue as { profiles?: unknown }).profiles)
      ? (catalogue as Catalogue).profiles
      : [];
  return async (url) => {
    if (host.down === true) throw new TypeError("Failed to fetch");
    if (url === CATALOGUE_URL) return reply(200, catalogue);
    const row = rows.find((r) => url === BASE + r.manifest);
    if (row !== undefined) {
      return host.broken?.includes(row.id) === true
        ? reply(503, "unavailable", "text/plain")
        : reply(200, setManifest(row));
    }
    return reply(404, "not found", "text/plain");
  };
}
