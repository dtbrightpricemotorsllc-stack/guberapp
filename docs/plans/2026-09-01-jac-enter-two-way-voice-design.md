# JAC ENTER-to-Voice Design

## Goal

One tap on ENTER must request microphone permission, unlock browser audio, start
JAC's voice session during the existing door cinematic, play JAC's welcome, and
leave the microphone live for automatic conversational turn-taking.

## Architecture

The door owns one canonical ElevenLabs ConvAI session. ENTER imperatively primes
the microphone and browser audio context before React state updates, while the
signed session request is warmed in parallel. The same session owns speech
recognition, JAC's approved voice output, and turn detection, preventing two
transports from competing for microphone or playback ownership.

## State and failure handling

The UI reports connected states only after the SDK confirms a real connection.
Microphone denial or absence exposes Type Instead without focusing it. Session,
audio, and transport failures remain voice-first and receive one automatic retry
without another tap. If retry fails, the scene shows an explicit not-connected
status rather than implying JAC can hear or speak.

## Verification

Regression tests cover one-tap activation, welcome/listening handoff, user and
assistant voice transcripts, microphone denial, automatic retry, and truthful
failure status using Android Chrome and Samsung Internet mobile profiles.