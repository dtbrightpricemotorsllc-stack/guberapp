export interface VideoFileMetadata {
  gps?: { lat: number; lng: number };
  capturedAt?: Date;
}

const MP4_EPOCH_OFFSET_SECONDS = 2_082_844_800;
const SCAN_BYTES = 4 * 1024 * 1024;

export async function readVideoFileMetadata(file: File): Promise<VideoFileMetadata> {
  const out: VideoFileMetadata = {};
  try {
    const headSize = Math.min(file.size, SCAN_BYTES);
    const head = new Uint8Array(await file.slice(0, headSize).arrayBuffer());
    extractFromBuffer(head, out);
    if (file.size > SCAN_BYTES * 2) {
      const tail = new Uint8Array(await file.slice(file.size - SCAN_BYTES).arrayBuffer());
      extractFromBuffer(tail, out);
    }
  } catch {}
  return out;
}

export function extractFromBuffer(buf: Uint8Array, out: VideoFileMetadata): void {
  if (!out.gps) {
    const gps = findIso6709Gps(buf);
    if (gps) out.gps = gps;
  }
  if (!out.capturedAt) {
    const ts = findMvhdCreationTime(buf);
    if (ts) out.capturedAt = ts;
  }
}

function findIso6709Gps(buf: Uint8Array): { lat: number; lng: number } | undefined {
  for (let i = 0; i < buf.length - 16; i++) {
    if (buf[i] === 0xa9 && buf[i + 1] === 0x78 && buf[i + 2] === 0x79 && buf[i + 3] === 0x7a) {
      const strLen = (buf[i + 4] << 8) | buf[i + 5];
      const start = i + 8;
      if (strLen > 0 && strLen < 64 && start + strLen <= buf.length) {
        try {
          const s = new TextDecoder("utf-8").decode(buf.subarray(start, start + strLen));
          const m = s.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
          if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
              return { lat, lng };
            }
          }
        } catch {}
      }
    }
  }
  return undefined;
}

function findMvhdCreationTime(buf: Uint8Array): Date | undefined {
  for (let i = 0; i < buf.length - 20; i++) {
    if (buf[i] === 0x6d && buf[i + 1] === 0x76 && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) {
      const version = buf[i + 4];
      const dataOffset = i + 8;
      let creationSec = 0;
      try {
        if (version === 1 && dataOffset + 8 <= buf.length) {
          const dv = new DataView(buf.buffer, buf.byteOffset + dataOffset, 8);
          const big = dv.getBigUint64(0);
          creationSec = Number(big);
        } else if (dataOffset + 4 <= buf.length) {
          const dv = new DataView(buf.buffer, buf.byteOffset + dataOffset, 4);
          creationSec = dv.getUint32(0);
        }
      } catch {
        continue;
      }
      if (creationSec > MP4_EPOCH_OFFSET_SECONDS) {
        const ms = (creationSec - MP4_EPOCH_OFFSET_SECONDS) * 1000;
        const now = Date.now();
        if (ms > 0 && ms < now + 86_400_000) {
          return new Date(ms);
        }
      }
    }
  }
  return undefined;
}
