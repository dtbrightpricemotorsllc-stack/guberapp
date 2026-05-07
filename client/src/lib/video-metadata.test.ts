import { describe, it, expect } from "vitest";
import { extractFromBuffer } from "./video-metadata";

const MP4_EPOCH_OFFSET_SECONDS = 2_082_844_800;

function buildMvhdV0Box(creationDate: Date): Uint8Array {
  // Parser layout: bytes [i..i+3]='mvhd', [i+4]=version, [i+5..i+7]=flags,
  // [i+8..i+11]=creationTime u32 (v0).
  // Parser scans `i < buf.length - 20`, so allocate enough trailing slack.
  const out = new Uint8Array(64);
  out[0] = 0x6d; // 'm'
  out[1] = 0x76; // 'v'
  out[2] = 0x68; // 'h'
  out[3] = 0x64; // 'd'
  out[4] = 0;    // version 0
  // flags (3 bytes) left zero
  const epochSec = Math.floor(creationDate.getTime() / 1000) + MP4_EPOCH_OFFSET_SECONDS;
  new DataView(out.buffer).setUint32(8, epochSec);
  return out;
}

function buildXyzBox(latLngString: string): Uint8Array {
  const text = new TextEncoder().encode(latLngString);
  const out = new Uint8Array(8 + text.length);
  out[0] = 0xa9; // ©
  out[1] = 0x78; // x
  out[2] = 0x79; // y
  out[3] = 0x7a; // z
  out[4] = (text.length >> 8) & 0xff;
  out[5] = text.length & 0xff;
  // bytes 6-7: language code, leave zero
  out.set(text, 8);
  return out;
}

describe("video-metadata extractFromBuffer", () => {
  it("extracts ISO-6709 GPS coordinates from a ©xyz box", () => {
    const buf = buildXyzBox("+37.7749-122.4194/");
    const out: { gps?: { lat: number; lng: number }; capturedAt?: Date } = {};
    extractFromBuffer(buf, out);
    expect(out.gps).toBeDefined();
    expect(out.gps!.lat).toBeCloseTo(37.7749, 4);
    expect(out.gps!.lng).toBeCloseTo(-122.4194, 4);
  });

  it("rejects malformed GPS payloads silently", () => {
    const buf = buildXyzBox("not-coordinates");
    const out: { gps?: { lat: number; lng: number } } = {};
    extractFromBuffer(buf, out);
    expect(out.gps).toBeUndefined();
  });

  it("extracts capturedAt from an mvhd box", () => {
    const when = new Date("2026-05-07T10:00:00Z");
    const buf = buildMvhdV0Box(when);
    const out: { capturedAt?: Date } = {};
    extractFromBuffer(buf, out);
    expect(out.capturedAt).toBeDefined();
    // mvhd resolution is 1s, allow 1s slack.
    expect(Math.abs(out.capturedAt!.getTime() - when.getTime())).toBeLessThanOrEqual(1000);
  });

  it("ignores nonsense future timestamps", () => {
    const farFuture = new Date(Date.now() + 10 * 365 * 86_400 * 1000);
    const buf = buildMvhdV0Box(farFuture);
    const out: { capturedAt?: Date } = {};
    extractFromBuffer(buf, out);
    expect(out.capturedAt).toBeUndefined();
  });

  it("does not overwrite an already-extracted GPS value", () => {
    const out: { gps?: { lat: number; lng: number } } = { gps: { lat: 1, lng: 2 } };
    const buf = buildXyzBox("+37.7749-122.4194/");
    extractFromBuffer(buf, out);
    expect(out.gps).toEqual({ lat: 1, lng: 2 });
  });
});
