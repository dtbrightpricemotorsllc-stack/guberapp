// @vitest-environment jsdom
//
// Component test for the Hands-Free POV import preflight flow (task-467 / task-472).
//
// Verifies:
//   - When an imported clip trips one or more preflight thresholds (too short,
//     too old, GPS too far from job site), the warning panel renders and lists
//     each reason as its own bullet.
//   - When the user confirms "Upload anyway", the resulting POST to
//     /api/proof/wearable-upload includes the warnings under
//     captureMeta.preflightWarnings so the hirer can see them on review.
//   - When the user backs out via "Pick a different clip", no upload happens.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/platform", () => ({
  isNativeApp: true,
  isAndroid: true,
  isIOS: false,
}));

vi.mock("@/lib/cloudinary-upload", () => ({
  uploadToCloudinarySigned: vi.fn(async () => ({
    url: "https://res.cloudinary.com/test/video/upload/v1/guber-proof/clip.mp4",
  })),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockApiRequest = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
}));

const mockReadMeta = vi.fn();
const mockReadDuration = vi.fn();
vi.mock("@/lib/video-metadata", () => ({
  readVideoFileMetadata: (...a: any[]) => mockReadMeta(...a),
  readVideoDurationSec: (...a: any[]) => mockReadDuration(...a),
}));

import { HandsFreeCapture } from "./handsfree-capture";

const JOB_ID = 12345;
const JOB_LAT = 37.7749;
const JOB_LNG = -122.4194;

function setConsented() {
  window.localStorage.setItem(`handsfree-consent-v1-job-${JOB_ID}`, "1");
}

function makeFile(name = "clip.mp4"): File {
  const blob = new Blob(["fake-bytes"], { type: "video/mp4" });
  return new File([blob], name, { type: "video/mp4", lastModified: Date.now() });
}

function jsonResp(payload: any) {
  return { ok: true, json: async () => payload } as any;
}

function installFetchMocks() {
  (globalThis as any).fetch = vi.fn(async (url: any) => {
    const u = typeof url === "string" ? url : String(url);
    if (u.includes("/api/upload-photo/sign")) {
      return jsonResp({
        signature: "sig",
        timestamp: 123,
        cloud_name: "test",
        api_key: "key",
        folder: "guber-proof",
      });
    }
    if (u.includes("api.cloudinary.com")) {
      return jsonResp({
        secure_url:
          "https://res.cloudinary.com/test/video/upload/v1/guber-proof/clip.mp4",
      });
    }
    return jsonResp({});
  });
}

describe("HandsFreeCapture preflight warnings (task-467/472)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setConsented();
    mockToast.mockReset();
    mockApiRequest.mockReset();
    mockReadMeta.mockReset();
    mockReadDuration.mockReset();
    installFetchMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows warning panel listing too-short, too-old, and too-far reasons", async () => {
    mockReadDuration.mockResolvedValue(10);
    mockReadMeta.mockResolvedValue({
      capturedAt: new Date(Date.now() - 48 * 3_600_000),
      gps: { lat: JOB_LAT + 0.01, lng: JOB_LNG },
    });

    render(
      <HandsFreeCapture
        jobId={JOB_ID}
        jobLat={JOB_LAT}
        jobLng={JOB_LNG}
        open
        onOpenChange={() => {}}
      />,
    );

    const input = await screen.findByTestId("input-handsfree-import");
    await userEvent.upload(input, makeFile());

    await screen.findByTestId("panel-handsfree-warning");
    const items = await screen.findAllByText(/.+/, {
      selector: "[data-testid^='text-handsfree-warning-']",
    });
    expect(items.length).toBe(3);
    const text = items.map((i) => i.textContent || "").join(" | ");
    expect(text).toMatch(/10s long/);
    expect(text).toMatch(/old/);
    expect(text).toMatch(/from the job site/);

    const proofPosts = mockApiRequest.mock.calls.filter(
      (c) => c[1] === "/api/proof/wearable-upload",
    );
    expect(proofPosts.length).toBe(0);
  });

  it("on 'Upload anyway', persists preflightWarnings on the wearable upload payload", async () => {
    mockReadDuration.mockResolvedValue(5);
    mockReadMeta.mockResolvedValue({
      capturedAt: new Date(Date.now() - 1 * 3_600_000),
      gps: undefined,
    });

    mockApiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes("wearable-upload-token")) {
        return { json: async () => ({ token: "tok.tok" }) };
      }
      return { json: async () => ({}) };
    });

    render(
      <HandsFreeCapture
        jobId={JOB_ID}
        jobLat={JOB_LAT}
        jobLng={JOB_LNG}
        open
        onOpenChange={() => {}}
      />,
    );

    const input = await screen.findByTestId("input-handsfree-import");
    await userEvent.upload(input, makeFile());

    await screen.findByTestId("panel-handsfree-warning");
    fireEvent.click(screen.getByTestId("button-handsfree-warning-confirm"));

    await waitFor(() => {
      const calls = mockApiRequest.mock.calls.filter(
        (c) => c[1] === "/api/proof/wearable-upload",
      );
      expect(calls.length).toBe(1);
    });

    const body = mockApiRequest.mock.calls.find(
      (c) => c[1] === "/api/proof/wearable-upload",
    )![2];
    expect(body.captureMeta.deviceKind).toBe("paired-android");
    expect(Array.isArray(body.captureMeta.preflightWarnings)).toBe(true);
    expect(body.captureMeta.preflightWarnings.length).toBeGreaterThan(0);
    expect(body.captureMeta.preflightWarnings.join(" ")).toMatch(/5s long/);
    expect(body.captureMeta.preflight.durationSec).toBe(5);
    expect(body.captureMeta.fileName).toBe("clip.mp4");
  });

  it("'Pick a different clip' aborts without uploading", async () => {
    mockReadDuration.mockResolvedValue(5);
    mockReadMeta.mockResolvedValue({ capturedAt: new Date() });

    render(
      <HandsFreeCapture
        jobId={JOB_ID}
        jobLat={JOB_LAT}
        jobLng={JOB_LNG}
        open
        onOpenChange={() => {}}
      />,
    );

    const input = await screen.findByTestId("input-handsfree-import");
    await userEvent.upload(input, makeFile());

    await screen.findByTestId("panel-handsfree-warning");
    fireEvent.click(screen.getByTestId("button-handsfree-warning-cancel"));

    await waitFor(() => {
      expect(screen.queryByTestId("panel-handsfree-warning")).toBeNull();
    });

    const proofPosts = mockApiRequest.mock.calls.filter(
      (c) => c[1] === "/api/proof/wearable-upload",
    );
    expect(proofPosts.length).toBe(0);
  });

  it("uploads silently (no warning panel) when preflight passes", async () => {
    mockReadDuration.mockResolvedValue(60);
    mockReadMeta.mockResolvedValue({
      capturedAt: new Date(Date.now() - 1 * 3_600_000),
      gps: { lat: JOB_LAT, lng: JOB_LNG },
    });

    mockApiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === "GET" && url.includes("wearable-upload-token")) {
        return { json: async () => ({ token: "tok.tok" }) };
      }
      return { json: async () => ({}) };
    });

    render(
      <HandsFreeCapture
        jobId={JOB_ID}
        jobLat={JOB_LAT}
        jobLng={JOB_LNG}
        open
        onOpenChange={() => {}}
      />,
    );

    const input = await screen.findByTestId("input-handsfree-import");
    await userEvent.upload(input, makeFile());

    await waitFor(() => {
      const calls = mockApiRequest.mock.calls.filter(
        (c) => c[1] === "/api/proof/wearable-upload",
      );
      expect(calls.length).toBe(1);
    });

    expect(screen.queryByTestId("panel-handsfree-warning")).toBeNull();

    const body = mockApiRequest.mock.calls.find(
      (c) => c[1] === "/api/proof/wearable-upload",
    )![2];
    expect(body.captureMeta.preflightWarnings).toEqual([]);
  });
});
