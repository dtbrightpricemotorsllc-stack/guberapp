type UploadStatus = "idle" | "uploading" | "done" | "error";

interface UploadState {
  status: UploadStatus;
  pct: number;
  errorMsg: string;
  activeCount: number;
}

type Listener = (state: UploadState) => void;

let state: UploadState = { status: "idle", pct: 0, errorMsg: "", activeCount: 0 };
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn({ ...state }));
}

export function subscribeUploadState(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getUploadState(): UploadState {
  return { ...state };
}

export function notifyUploadStart() {
  state = { ...state, status: "uploading", pct: 0, activeCount: state.activeCount + 1 };
  emit();
}

export function notifyUploadProgress(pct: number) {
  if (state.status !== "uploading") return;
  state = { ...state, pct };
  emit();
}

export function notifyUploadDone() {
  const remaining = Math.max(0, state.activeCount - 1);
  state = { ...state, activeCount: remaining, pct: 100, status: remaining > 0 ? "uploading" : "done" };
  emit();
}

export function notifyUploadError(msg = "Upload failed") {
  const remaining = Math.max(0, state.activeCount - 1);
  state = { ...state, activeCount: remaining, status: remaining > 0 ? "uploading" : "error", errorMsg: msg };
  emit();
}

export function resetUploadState() {
  state = { status: "idle", pct: 0, errorMsg: "", activeCount: 0 };
  emit();
}
