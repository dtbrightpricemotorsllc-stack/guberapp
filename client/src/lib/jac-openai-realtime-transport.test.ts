// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeRealtimeEvent,
  JacOpenAIRealtimeTransport,
  makeExactTextResponse,
} from "./jac-openai-realtime-transport";
import { JAC_VOLUME_BOUNDS, setJacVolume } from "./jac-tts";

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  close = vi.fn();
  constructor(public url: string) { MockSocket.instances.push(this); }
  send(value: string) { this.sent.push(value); }
  open() { this.readyState = 1; this.onopen?.(new Event("open")); }
  message(value: unknown) { this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) })); }
}

function audioMocks() {
  const sources: any[] = [];
  const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const capture = { connect: vi.fn(), disconnect: vi.fn(), onaudioprocess: null };
  const gains: any[] = [];
  const context = {
    sampleRate: 24_000,
    currentTime: 0,
    state: "running",
    destination: {},
    createMediaStreamSource: vi.fn(() => sourceNode),
    createScriptProcessor: vi.fn(() => capture),
    createGain: vi.fn(() => {
      const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } };
      gains.push(gain);
      return gain;
    }),
    createBuffer: vi.fn((_channels, length, rate) => ({
      duration: length / rate,
      getChannelData: () => new Float32Array(length),
    })),
    createBufferSource: vi.fn(() => {
      const source = { connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null, buffer: null };
      sources.push(source);
      return source;
    }),
    resume: vi.fn(),
    close: vi.fn(async () => { context.state = "closed"; }),
  };
  return { context, sourceNode, capture, gains, sources };
}

async function connectedTransport(callbacks: Record<string, any> = {}) {
  const audio = audioMocks();
  const track = { stop: vi.fn(), enabled: true };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const transport = new JacOpenAIRealtimeTransport({
    sessionEndpoint: "/session",
    fetch: vi.fn(async () => ({ ok: true, json: async () => ({ client_secret: { value: "short-token" } }) })) as any,
    WebSocket: MockSocket as any,
    AudioContext: vi.fn(function MockAudioContext() { return audio.context; }) as any,
    getUserMedia: vi.fn(async () => stream),
    ...callbacks,
  });
  await transport.start();
  const socket = MockSocket.instances.at(-1)!;
  socket.open();
  return { transport, socket, audio, track };
}

describe("JacOpenAIRealtimeTransport", () => {
  beforeEach(() => {
    MockSocket.instances = [];
    vi.stubGlobal("AudioWorkletNode", undefined);
    setJacVolume(JAC_VOLUME_BOUNDS.default);
  });

  it("parses valid events and ignores malformed frames", () => {
    expect(decodeRealtimeEvent('{"type":"response.created"}')).toEqual({ type: "response.created" });
    expect(decodeRealtimeEvent("{")).toBeNull();
    expect(decodeRealtimeEvent('{"delta":"x"}')).toBeNull();
  });

  it("builds an exact-text response for relay-side wrapping", () => {
    const event = makeExactTextResponse("Approved words.");
    expect(event.type).toBe("response.create");
    expect(event).toEqual(expect.objectContaining({
      response: expect.objectContaining({ output_modalities: ["audio"] }),
    }));
    const instructions = (event.response as any).instructions;
    expect(instructions).toBe("Approved words.");
  });

  it("starts microphone and audio preparation from a user gesture without repeating either", async () => {
    const audio = audioMocks();
    const track = { stop: vi.fn(), enabled: true };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const AudioContext = vi.fn(function MockAudioContext() { return audio.context; }) as any;
    const transport = new JacOpenAIRealtimeTransport({
      sessionEndpoint: "/session",
      fetch: vi.fn(async () => ({ ok: true, json: async () => ({ client_secret: { value: "short-token" } }) })) as any,
      WebSocket: MockSocket as any,
      AudioContext,
      getUserMedia,
    });

    transport.prepareForUserGesture();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(AudioContext).toHaveBeenCalledTimes(1);

    await transport.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(AudioContext).toHaveBeenCalledTimes(1);
    await transport.end();
  });

  it("distinguishes microphone denial from transport failures", async () => {
    const onError = vi.fn();
    const transport = new JacOpenAIRealtimeTransport({
      sessionEndpoint: "/session",
      fetch: vi.fn(async () => ({ ok: true, json: async () => ({ token: "short-token" }) })) as any,
      WebSocket: MockSocket as any,
      AudioContext: vi.fn(function MockAudioContext() { return audioMocks().context; }) as any,
      getUserMedia: vi.fn(async () => {
        throw new DOMException("Permission denied", "NotAllowedError");
      }),
      onError,
    });

    transport.prepareForUserGesture();
    await transport.start();

    expect(onError).toHaveBeenCalledWith("Permission denied", "microphone-denied");
    expect(transport.phase).toBe("error");
  });

  it("reuses gesture-prepared microphone and audio when a session retry succeeds", async () => {
    const audio = audioMocks();
    const track = { stop: vi.fn(), enabled: true, readyState: "live" };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    const AudioContext = vi.fn(function MockAudioContext() { return audio.context; }) as any;
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "short-token" }) });
    const onError = vi.fn();
    const transport = new JacOpenAIRealtimeTransport({
      sessionEndpoint: "/session",
      fetch: fetch as any,
      WebSocket: MockSocket as any,
      AudioContext,
      getUserMedia,
      onError,
    });

    transport.prepareForUserGesture();
    await transport.start();
    expect(onError).toHaveBeenCalledWith("Voice session request failed (503).", "session");

    await transport.reconnect();
    MockSocket.instances.at(-1)!.open();

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(AudioContext).toHaveBeenCalledTimes(1);
    expect(track.stop).not.toHaveBeenCalled();
    expect(transport.phase).toBe("listening");
    await transport.end();
  });

  it("reports transcripts and sends exact-text response.create", async () => {
    const onUserTranscript = vi.fn();
    const onJacResponse = vi.fn();
    const { transport, socket } = await connectedTransport({ onUserTranscript, onJacResponse });
    socket.message({ type: "conversation.item.input_audio_transcription.completed", transcript: " hello " });
    socket.message({ type: "response.output_audio_transcript.done", transcript: " Hi there " });
    transport.speakApprovedText("Only this.");
    expect(onUserTranscript).toHaveBeenCalledWith("hello");
    expect(onJacResponse).toHaveBeenCalledWith("Hi there");
    expect(socket.sent.map(JSON.parse)).toContainEqual(makeExactTextResponse("Only this."));
  });

  it("batches microphone render frames before sending audio", async () => {
    const { socket, audio } = await connectedTransport();
    const makeAudioEvent = () => ({
      inputBuffer: {
        getChannelData: () => new Float32Array(2_048),
      },
    });
    audio.capture.onaudioprocess(makeAudioEvent());
    expect(socket.sent).toHaveLength(0);
    audio.capture.onaudioprocess(makeAudioEvent());
    expect(socket.sent.map(JSON.parse)).toEqual([
      expect.objectContaining({ type: "input_audio_buffer.append" }),
    ]);
  });

  it("cancels and clears queued local playback on barge-in", async () => {
    const { socket, audio } = await connectedTransport();
    const pcm = btoa(String.fromCharCode(0, 0, 1, 0));
    socket.message({ type: "response.output_audio.delta", delta: pcm });
    expect(audio.sources[0].start).toHaveBeenCalled();
    socket.message({ type: "input_audio_buffer.speech_started" });
    expect(audio.sources[0].stop).toHaveBeenCalled();
    expect(socket.sent.map(JSON.parse)).toContainEqual({ type: "response.cancel" });
    expect(socket.sent.map(JSON.parse)).not.toContainEqual({ type: "output_audio_buffer.clear" });
  });

  it("routes realtime speech through the saved JAC volume gain", async () => {
    setJacVolume(3.25);
    const { socket, audio } = await connectedTransport();
    const pcm = btoa(String.fromCharCode(0, 0, 1, 0));
    socket.message({ type: "response.output_audio.delta", delta: pcm });

    expect(audio.gains[0].gain.value).toBe(3.25);
    expect(audio.sources[0].connect).toHaveBeenCalledWith(audio.gains[0]);
    expect(audio.gains[0].connect).toHaveBeenCalledWith(audio.context.destination);
  });

  it("fully cleans up socket, media, nodes, output, and the one context", async () => {
    const { transport, socket, audio, track } = await connectedTransport();
    const pcm = btoa(String.fromCharCode(0, 0));
    socket.message({ type: "response.audio.delta", delta: pcm });
    await transport.end();
    expect(socket.close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
    expect(audio.sourceNode.disconnect).toHaveBeenCalled();
    expect(audio.capture.disconnect).toHaveBeenCalled();
    expect(audio.gains).toHaveLength(2);
    expect(audio.gains[0].disconnect).toHaveBeenCalled();
    expect(audio.gains[1].disconnect).toHaveBeenCalled();
    expect(audio.sources[0].stop).toHaveBeenCalled();
    expect(audio.context.close).toHaveBeenCalledTimes(1);
    expect(transport.phase).toBe("idle");
  });
});