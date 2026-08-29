export type JacRealtimePhase =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "muted"
  | "error";

export interface JacRealtimeCallbacks {
  onPhaseChange?(phase: JacRealtimePhase): void;
  onUserTranscript?(text: string): void;
  onJacResponse?(text: string): void;
  onError?(message: string): void;
}

export interface JacRealtimeTransportOptions extends JacRealtimeCallbacks {
  sessionEndpoint: string;
  realtimePath?: string;
  fetch?: typeof globalThis.fetch;
  WebSocket?: typeof globalThis.WebSocket;
  AudioContext?: typeof globalThis.AudioContext;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
}

type JsonEvent = Record<string, unknown> & { type?: string };

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const WORKLET_SOURCE = `
class JacPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) this.port.postMessage(channel.slice(0));
    return true;
  }
}
registerProcessor("jac-pcm-capture", JacPcmCapture);
`;

function tokenFromSession(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const session = value as Record<string, unknown>;
  for (const key of ["token", "value", "clientSecret", "client_secret", "ephemeralToken"]) {
    const candidate = session[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (candidate && typeof candidate === "object") {
      const nested = tokenFromSession(candidate);
      if (nested) return nested;
    }
  }
  return null;
}

export function makeExactTextResponse(text: string): JsonEvent {
  return {
    type: "response.create",
    response: {
      output_modalities: ["audio"],
      // The same-origin relay securely applies the exact-speech instruction upstream.
      instructions: text,
    },
  };
}

export function decodeRealtimeEvent(data: unknown): JsonEvent | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed === "object" && typeof parsed.type === "string"
      ? parsed as JsonEvent
      : null;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const stride = 0x8000;
  for (let i = 0; i < bytes.length; i += stride) {
    binary += String.fromCharCode(...bytes.subarray(i, i + stride));
  }
  return btoa(binary);
}

function base64ToInt16(value: string): Int16Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function pcm16Base64(samples: Float32Array, inputRate: number): string {
  const ratio = inputRate / 24_000;
  const length = Math.max(1, Math.floor(samples.length / ratio));
  const pcm = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((i + 1) * ratio)));
    let sample = 0;
    for (let j = start; j < end; j++) sample += samples[j];
    sample = Math.max(-1, Math.min(1, sample / (end - start)));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return bytesToBase64(new Uint8Array(pcm.buffer));
}

export class JacOpenAIRealtimeTransport {
  private options: JacRealtimeTransportOptions;
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private captureNode: AudioNode | null = null;
  private captureSink: GainNode | null = null;
  private workletUrl: string | null = null;
  private outputSources = new Set<AudioBufferSourceNode>();
  private nextPlayTime = 0;
  private responseText = "";
  private captureChunks: Float32Array[] = [];
  private captureSampleCount = 0;
  private stopped = true;
  private muted = false;
  private errorReported = false;
  private generation = 0;
  private _phase: JacRealtimePhase = "idle";

  constructor(options: JacRealtimeTransportOptions) {
    this.options = options;
  }

  get phase(): JacRealtimePhase { return this._phase; }
  get connected(): boolean { return this.socket?.readyState === 1; }
  get isMuted(): boolean { return this.muted; }

  async start(): Promise<void> {
    await this.teardown(false);
    const generation = ++this.generation;
    this.stopped = false;
    this.errorReported = false;
    this.setPhase("connecting");

    try {
      const fetchImpl = this.options.fetch ?? globalThis.fetch;
      const media = this.options.getUserMedia
        ?? ((constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints));
      const [response, stream] = await Promise.all([
        fetchImpl(this.options.sessionEndpoint, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transport: "websocket", audioFormat: "pcm16", sampleRate: 24_000 }),
        }),
        media({ audio: MIC_CONSTRAINTS }),
      ]);
      if (!response.ok) throw new Error(`Voice session request failed (${response.status}).`);
      const token = tokenFromSession(await response.json());
      if (!token) throw new Error("Voice session did not return a short-lived token.");
      if (this.stopped || generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.stream = stream;
      const AudioContextImpl = this.options.AudioContext
        ?? globalThis.AudioContext
        ?? (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextImpl) throw new Error("Web Audio is not supported in this browser.");
      this.context = new AudioContextImpl({ sampleRate: 24_000 });
      if (this.context.state === "suspended") await this.context.resume();
      await this.setupCapture();

      const location = window.location;
      const url = new URL(this.options.realtimePath ?? "/api/jac/realtime", location.origin);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("token", token);
      const WebSocketImpl = this.options.WebSocket ?? globalThis.WebSocket;
      this.socket = new WebSocketImpl(url.toString());
      this.socket.onopen = () => {
        if (generation !== this.generation || this.stopped) return;
        this.setPhase(this.muted ? "muted" : "listening");
      };
      this.socket.onmessage = event => this.handleEvent(decodeRealtimeEvent(event.data));
      this.socket.onerror = () => this.fail("Voice connection lost.");
      this.socket.onclose = () => {
        if (!this.stopped && generation === this.generation) this.fail("Voice disconnected.");
      };
    } catch (error) {
      this.fail(error instanceof Error ? error.message : "Voice could not start.");
      await this.teardown(false);
    }
  }

  reconnect(): Promise<void> {
    return this.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !muted; });
    if (muted) this.setPhase("muted");
    else if (this.connected) this.setPhase("listening");
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  speakApprovedText(text: string): void {
    const approved = text.trim();
    if (!approved) return;
    this.responseText = "";
    this.send(makeExactTextResponse(approved));
    this.setPhase("thinking");
  }

  end(): Promise<void> {
    return this.teardown(true);
  }

  private async setupCapture(): Promise<void> {
    const context = this.context!;
    this.mediaSource = context.createMediaStreamSource(this.stream!);
    const receive = (samples: Float32Array) => {
      if (this.muted || this.stopped || !this.connected) return;
      this.captureChunks.push(samples);
      this.captureSampleCount += samples.length;
      const targetSamples = Math.max(1, Math.round(context.sampleRate / 10));
      if (this.captureSampleCount < targetSamples) return;
      const batch = new Float32Array(this.captureSampleCount);
      let offset = 0;
      for (const chunk of this.captureChunks) {
        batch.set(chunk, offset);
        offset += chunk.length;
      }
      this.captureChunks = [];
      this.captureSampleCount = 0;
      this.send({ type: "input_audio_buffer.append", audio: pcm16Base64(batch, context.sampleRate) });
    };

    if (context.audioWorklet && typeof AudioWorkletNode !== "undefined") {
      const blob = new Blob([WORKLET_SOURCE], { type: "text/javascript" });
      this.workletUrl = URL.createObjectURL(blob);
      await context.audioWorklet.addModule(this.workletUrl);
      const node = new AudioWorkletNode(context, "jac-pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = event => receive(event.data as Float32Array);
      this.captureNode = node;
    } else {
      // Isolated compatibility path for browsers without AudioWorklet.
      const node = context.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = event => receive(event.inputBuffer.getChannelData(0).slice());
      this.captureNode = node;
    }
    this.captureSink = context.createGain();
    this.captureSink.gain.value = 0;
    this.mediaSource.connect(this.captureNode);
    this.captureNode.connect(this.captureSink);
    this.captureSink.connect(context.destination);
  }

  private handleEvent(event: JsonEvent | null): void {
    if (!event) return;
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        this.interrupt();
        this.setPhase(this.muted ? "muted" : "listening");
        break;
      case "input_audio_buffer.speech_stopped":
      case "response.created":
        this.setPhase("thinking");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
        if (transcript) this.options.onUserTranscript?.(transcript);
        break;
      }
      case "response.audio.delta":
      case "response.output_audio.delta":
        if (typeof event.delta === "string" && event.delta) this.playAudio(event.delta);
        break;
      case "response.audio_transcript.delta":
      case "response.output_audio_transcript.delta":
        if (typeof event.delta === "string") this.responseText += event.delta;
        break;
      case "response.audio_transcript.done":
      case "response.output_audio_transcript.done": {
        const transcript = typeof event.transcript === "string" ? event.transcript : this.responseText;
        if (transcript.trim()) this.options.onJacResponse?.(transcript.trim());
        this.responseText = "";
        break;
      }
      case "response.done":
        if (!this.outputSources.size) this.setPhase(this.muted ? "muted" : "listening");
        break;
      case "error": {
        const error = event.error as Record<string, unknown> | undefined;
        this.fail(typeof error?.message === "string" ? error.message : "Voice connection error.");
        break;
      }
    }
  }

  private playAudio(delta: string): void {
    if (!this.context || this.muted) return;
    const pcm = base64ToInt16(delta);
    if (!pcm.length) return;
    const buffer = this.context.createBuffer(1, pcm.length, 24_000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    const startAt = Math.max(this.context.currentTime, this.nextPlayTime);
    this.nextPlayTime = startAt + buffer.duration;
    this.outputSources.add(source);
    source.onended = () => {
      this.outputSources.delete(source);
      if (!this.outputSources.size && !this.stopped) {
        this.setPhase(this.muted ? "muted" : "listening");
      }
    };
    source.start(startAt);
    this.setPhase("speaking");
  }

  private interrupt(): void {
    if (this.outputSources.size || this._phase === "speaking" || this._phase === "thinking") {
      this.send({ type: "response.cancel" });
    }
    for (const source of this.outputSources) {
      source.onended = null;
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    this.outputSources.clear();
    this.nextPlayTime = this.context?.currentTime ?? 0;
    this.responseText = "";
  }

  private send(event: JsonEvent): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(event));
  }

  private fail(message: string): void {
    if (this.stopped || this.errorReported) return;
    this.errorReported = true;
    this.setPhase("error");
    this.options.onError?.(message);
  }

  private setPhase(phase: JacRealtimePhase): void {
    if (this._phase === phase) return;
    this._phase = phase;
    this.options.onPhaseChange?.(phase);
  }

  private async teardown(reportIdle: boolean): Promise<void> {
    this.stopped = true;
    this.generation++;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { socket.close(1000, "client ended"); } catch {}
    }
    this.interrupt();
    try { this.mediaSource?.disconnect(); } catch {}
    try { this.captureNode?.disconnect(); } catch {}
    try { this.captureSink?.disconnect(); } catch {}
    this.mediaSource = null;
    this.captureNode = null;
    this.captureSink = null;
    this.captureChunks = [];
    this.captureSampleCount = 0;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") {
      try { await context.close(); } catch {}
    }
    if (this.workletUrl) {
      URL.revokeObjectURL(this.workletUrl);
      this.workletUrl = null;
    }
    if (reportIdle) this.setPhase("idle");
  }
}