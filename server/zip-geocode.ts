import { readFileSync } from "fs";
import { join } from "path";

const ZIP_LOOKUP: Record<string, [number, number]> = JSON.parse(
  readFileSync(join(process.cwd(), "server/zip-data.json"), "utf-8")
);

export function geocodeZip(zip: string): { lat: number; lng: number } | null {
  const z = (zip || "").trim().padStart(5, "0");
  const entry = ZIP_LOOKUP[z];
  if (!entry) return null;
  return { lat: entry[0], lng: entry[1] };
}
