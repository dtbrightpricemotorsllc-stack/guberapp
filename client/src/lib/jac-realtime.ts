/**
 * JAC Realtime — WebRTC client for OpenAI Realtime API.
 *
 * Flow:
 *  1. Call /api/jac/realtime-session → get ephemeral token
 *  2. Create RTCPeerConnection + data channel
 *  3. Send SDP offer to OpenAI Realtime endpoint
 *  4. Handle audio track (speaker output) + data channel events
 *  5. Tool calls: receive on DC → POST /api/jac/realtime-tool → send result back
 */

export type JacRealtimeStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "speaking"
  | "tool_calling"
  | "interrupted"
  | "error"
  | "closed";

export interface JacRealtimeMetrics {
  sessionStartedAt: number | null;
  firstAudioAt: number | null;
  firstTranscriptAt: number | null;
  interruptionCount: number;
  toolCallCount: number;
  toolCallTotalMs: number;
  messageCount: number;
  /** ms from session start until JAC first spoke */
  timeToFirstAudioMs: number | null;
}

export interface JacRealtimeEvent {
  type:
    | "status"
    | "transcript_delta"
    | "transcript_done"
    | "user_transcript"
    | "tool_call"
    | "tool_result"
    | "navigate"
    | "error"
    | "metrics";
  payload: any;
}

export type JacRealtimeEventHandler = (event: JacRealtimeEvent) => void;

const OPENAI_REALTIME_BASE = "https://api.openai.com/v1/realtime";

export class JacRealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private localStream: MediaStream | null = null;
  private status: JacRealtimeStatus = "idle";
  private metrics: JacRealtimeMetrics = {
    sessionStartedAt: null,
    firstAudioAt: null,
    firstTranscriptAt: null,
    interruptionCount: 0,
    toolCallCount: 0,
    toolCallTotalMs: 0,
    messageCount: 0,
    timeToFirstAudioMs: null,
  };
  private handlers: JacRealtimeEventHandler[] = [];
  private model = "gpt-4o-realtime-preview-2024-12-17";
  private currentTranscript = "";

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  on(handler: JacRealtimeEventHandler) {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter(h => h !== handler); };
  }

  private emit(type: JacRealtimeEvent["type"], payload: any) {
    for (const h of this.handlers) {
      try { h({ type, payload }); } catch { /* noop */ }
    }
  }

  private setStatus(s: JacRealtimeStatus) {
    this.status = s;
    this.emit("status", { status: s });
  }

  getStatus() { return this.status; }
  getMetrics() { return { ...this.metrics }; }

  // ── Connect ─────────────────────────────────────────────────────────────────

  async connect() {
    if (this.status !== "idle" && this.status !== "closed" && this.status !== "error") {
      console.warn("[jac-rt] already connected or connecting");
      return;
    }
    this.setStatus("connecting");
    this.metrics.sessionStartedAt = Date.now();

    try {
      // 1. Get ephemeral token from our server
      const sessRes = await fetch("/api/jac/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!sessRes.ok) {
        const e = await sessRes.text();
        throw new Error(`Session error ${sessRes.status}: ${e}`);
      }
      const { ephemeralKey, model } = await sessRes.json() as {
        ephemeralKey: string;
        model: string;
        voice: string;
        sessionId: string;
      };
      this.model = model;

      // 2. Create peer connection
      this.pc = new RTCPeerConnection();

      // 3. Receive audio from OpenAI
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.audioEl.setAttribute("playsinline", "");
      this.pc.ontrack = (e) => {
        if (!this.audioEl) return;
        this.audioEl.srcObject = e.streams[0];
        if (!this.metrics.firstAudioAt) {
          this.metrics.firstAudioAt = Date.now();
          if (this.metrics.sessionStartedAt) {
            this.metrics.timeToFirstAudioMs = this.metrics.firstAudioAt - this.metrics.sessionStartedAt;
          }
          this.emit("metrics", this.getMetrics());
        }
        this.setStatus("speaking");
      };

      // 4. Add local microphone track
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000,
        },
      });
      for (const track of this.localStream.getTracks()) {
        this.pc.addTrack(track, this.localStream);
      }

      // 5. Create data channel
      this.dc = this.pc.createDataChannel("oai-events");
      this.dc.onopen = () => {
        this.setStatus("ready");
        console.log("[jac-rt] data channel open");
      };
      this.dc.onmessage = (e) => this.handleDCMessage(e.data);
      this.dc.onerror = (e) => {
        console.error("[jac-rt] DC error", e);
        this.emit("error", { message: "Data channel error" });
      };
      this.dc.onclose = () => {
        console.log("[jac-rt] DC closed");
        if (this.status !== "closed") this.setStatus("closed");
      };

      // 6. Create SDP offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // 7. Connect to OpenAI Realtime
      const sdpRes = await fetch(`${OPENAI_REALTIME_BASE}?model=${this.model}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpRes.ok) {
        const e = await sdpRes.text();
        throw new Error(`OpenAI WebRTC error ${sdpRes.status}: ${e}`);
      }

      const answerSdp = await sdpRes.text();
      await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      console.log("[jac-rt] WebRTC connected to OpenAI Realtime");

    } catch (err: any) {
      console.error("[jac-rt] connect failed:", err);
      this.setStatus("error");
      this.emit("error", { message: err?.message || "Connection failed" });
      this.cleanup(false);
    }
  }

  // ── Data Channel Event Handling ─────────────────────────────────────────────

  private async handleDCMessage(raw: string) {
    let event: any;
    try { event = JSON.parse(raw); } catch { return; }

    switch (event.type) {
      case "session.created":
      case "session.updated":
        console.log("[jac-rt] session ready:", event.type);
        break;

      case "input_audio_buffer.speech_started":
        this.metrics.interruptionCount++;
        this.setStatus("listening");
        this.emit("metrics", this.getMetrics());
        break;

      case "input_audio_buffer.speech_stopped":
        if (this.status === "listening") this.setStatus("ready");
        break;

      case "conversation.item.input_audio_transcription.completed":
        this.emit("user_transcript", { text: event.transcript });
        break;

      case "response.audio_transcript.delta":
        this.currentTranscript += event.delta || "";
        if (!this.metrics.firstTranscriptAt) {
          this.metrics.firstTranscriptAt = Date.now();
          this.emit("metrics", this.getMetrics());
        }
        this.emit("transcript_delta", { text: this.currentTranscript, delta: event.delta });
        this.setStatus("speaking");
        break;

      case "response.audio_transcript.done":
        this.metrics.messageCount++;
        this.emit("transcript_done", { text: event.transcript || this.currentTranscript });
        this.currentTranscript = "";
        break;

      case "response.done":
        if (this.status === "speaking") this.setStatus("ready");
        break;

      case "response.function_call_arguments.done":
        await this.handleToolCall(event);
        break;

      case "error":
        console.error("[jac-rt] OpenAI error:", event.error);
        this.emit("error", { message: event.error?.message || "OpenAI error" });
        if (event.error?.type === "session_expired") {
          this.setStatus("closed");
          this.cleanup(false);
        }
        break;
    }
  }

  // ── Tool Call Execution ─────────────────────────────────────────────────────

  private async handleToolCall(event: any) {
    const { call_id, name } = event;
    let args: Record<string, any> = {};
    try { args = JSON.parse(event.arguments || "{}"); } catch { /* noop */ }

    this.setStatus("tool_calling");
    this.emit("tool_call", { name, args, callId: call_id });
    this.metrics.toolCallCount++;

    const toolStart = Date.now();
    let result: Record<string, any>;

    try {
      const r = await fetch("/api/jac/realtime-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, args }),
      });
      result = r.ok ? await r.json() : { error: `Tool server error: ${r.status}` };
    } catch (err: any) {
      result = { error: err?.message || "Tool call failed" };
    }

    this.metrics.toolCallTotalMs += Date.now() - toolStart;
    this.emit("tool_result", { name, result, durationMs: Date.now() - toolStart });
    this.emit("metrics", this.getMetrics());

    // Handle navigate action client-side
    if (result.action === "navigate" && result.route) {
      this.emit("navigate", { route: result.route, reason: result.reason });
    }

    // Send result back to OpenAI
    if (!this.dc || this.dc.readyState !== "open") return;

    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id,
        output: JSON.stringify(result),
      },
    });

    // Request next response
    this.sendEvent({ type: "response.create" });
    this.setStatus("ready");
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  sendEvent(event: Record<string, any>) {
    if (!this.dc || this.dc.readyState !== "open") {
      console.warn("[jac-rt] DC not open, can't send event");
      return;
    }
    this.dc.send(JSON.stringify(event));
  }

  /** Inject a text message as if the user said it (for testing/demo) */
  injectUserMessage(text: string) {
    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
    this.sendEvent({ type: "response.create" });
  }

  /** Mute / unmute the local microphone */
  setMuted(muted: boolean) {
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  disconnect() {
    this.cleanup(true);
  }

  private cleanup(graceful: boolean) {
    this.dc?.close();
    this.pc?.close();
    this.localStream?.getTracks().forEach(t => t.stop());
    if (this.audioEl) {
      this.audioEl.srcObject = null;
      this.audioEl = null;
    }
    this.dc = null;
    this.pc = null;
    this.localStream = null;
    if (graceful) this.setStatus("closed");
  }

  /** Reset so connect() can be called again */
  reset() {
    this.cleanup(false);
    this.status = "idle";
    this.metrics = {
      sessionStartedAt: null,
      firstAudioAt: null,
      firstTranscriptAt: null,
      interruptionCount: 0,
      toolCallCount: 0,
      toolCallTotalMs: 0,
      messageCount: 0,
      timeToFirstAudioMs: null,
    };
    this.currentTranscript = "";
    this.emit("status", { status: "idle" });
  }
}
