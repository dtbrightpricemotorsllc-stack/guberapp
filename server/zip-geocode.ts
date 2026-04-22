import * as zipcodesLib from "zipcodes";

export interface ZipCoords {
  latitude: number;
  longitude: number;
}

export function lookupZip(zip: string): ZipCoords | null {
  const result = zipcodesLib.lookup(zip);
  if (!result) return null;
  return { latitude: result.latitude, longitude: result.longitude };
}
