/**
 * Venue photo files. Postgres (listing_photos) holds the metadata; this stores the bytes.
 *
 *  local     demo mode and local runs: files under .data/photos (never committed)
 *  supabase  hosted: a PRIVATE Supabase Storage bucket, reached only from the server with the
 *            service-role/secret key. Browsers never get storage credentials or direct bucket URLs;
 *            they load photos through /photos/<id>/<size>, which checks who may see them.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";

export interface PhotoStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(keys: string[]): Promise<void>;
}

const safeKey = (key: string) => {
  if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("Bad storage key");
  return key;
};

export function localPhotoStore(dir: string): PhotoStore {
  const root = path.resolve(dir);
  const file = (key: string) => path.join(root, safeKey(key));
  return {
    async put(key, bytes) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), bytes);
    },
    async get(key) {
      return fs.readFile(file(key)).catch(() => null);
    },
    async remove(keys) {
      await Promise.all(keys.map((k) => fs.rm(file(k), { force: true })));
    },
  };
}

export function supabasePhotoStore(url: string, serviceKey: string, bucket: string, fetchImpl: typeof fetch = fetch): PhotoStore {
  // New Supabase secret keys (sb_secret_…) go in the apikey header; legacy service_role JWTs also as a bearer token.
  const headers = (extra: Record<string, string> = {}) => ({
    apikey: serviceKey,
    ...(serviceKey.startsWith("eyJ") ? { authorization: `Bearer ${serviceKey}` } : {}),
    ...extra,
  });
  const object = (key: string) => `${url}/storage/v1/object/${encodeURIComponent(bucket)}/${safeKey(key)}`;
  const fail = async (what: string, r: Response) => {
    const body = await r.json().then((b: { message?: string; error?: string }) => b.message ?? b.error ?? "").catch(() => "");
    throw new Error(`Photo storage ${what} failed (${r.status}${body ? `: ${body}` : ""})`);
  };
  return {
    async put(key, bytes, contentType) {
      const r = await fetchImpl(object(key), { method: "POST", headers: headers({ "content-type": contentType, "x-upsert": "true", "cache-control": "31536000" }), body: new Uint8Array(bytes) });
      if (!r.ok) await fail("upload", r);
    },
    async get(key) {
      const r = await fetchImpl(object(key), { headers: headers() });
      if (r.status === 400 || r.status === 404) return null;
      if (!r.ok) await fail("download", r);
      return Buffer.from(await r.arrayBuffer());
    },
    async remove(keys) {
      if (keys.length === 0) return;
      const r = await fetchImpl(`${url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
        method: "DELETE", headers: headers({ "content-type": "application/json" }), body: JSON.stringify({ prefixes: keys.map(safeKey) }),
      });
      if (!r.ok) await fail("delete", r);
    },
  };
}

let store: PhotoStore | null | undefined;
/** The configured store, or null when photo storage isn't set up on this deployment. */
export function photoStore(): PhotoStore | null {
  if (store !== undefined) return store;
  const p = config().photos;
  store = p.kind === "local" ? localPhotoStore(p.dir) : p.kind === "supabase" ? supabasePhotoStore(p.url, p.serviceKey, p.bucket) : null;
  return store;
}

export function setPhotoStoreForTests(s: PhotoStore | null | undefined) {
  store = s;
}
