import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  RemoteParticipant,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  type RemoteAudioTrack,
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import { logger } from "../logger.js";

export interface LiveKitConfig {
  /** LiveKit server URL — wss:// for cloud, ws:// for local dev. */
  url: string;
  /** API key + secret for token minting (server-side only). */
  apiKey: string;
  apiSecret: string;
}

export interface JoinRoomOptions {
  roomName: string;
  identity: string; // participant identity, e.g. "tester-sarah"
  metadata?: string;
}

/**
 * Audio publisher: feeds Kokoro-synthesized PCM into a LiveKit room as
 * if it were a microphone.
 */
export class VoicePublisher {
  private source: AudioSource | null = null;
  private track: LocalAudioTrack | null = null;

  constructor(
    private room: Room,
    private sampleRate = 24000,
    private channels = 1,
  ) {}

  async start(trackName = "persona-voice"): Promise<void> {
    this.source = new AudioSource(this.sampleRate, this.channels);
    this.track = LocalAudioTrack.createAudioTrack(trackName, this.source);
    const opts = new TrackPublishOptions();
    opts.source = TrackSource.SOURCE_MICROPHONE;
    await this.room.localParticipant!.publishTrack(this.track, opts);
    logger.info({ trackName, sampleRate: this.sampleRate }, "publisher: track published");
  }

  /**
   * Send a chunk of audio (Int16 PCM) into the room. The sample rate
   * must match what was passed to start().
   */
  async sendAudio(samples: Int16Array): Promise<void> {
    if (!this.source) throw new Error("publisher not started");
    const frame = new AudioFrame(
      samples,
      this.sampleRate,
      this.channels,
      samples.length / this.channels,
    );
    await this.source.captureFrame(frame);
  }

  /**
   * Wait for the source to drain (all queued frames played out).
   * Called between persona utterances.
   */
  async waitForDrain(): Promise<void> {
    if (!this.source) return;
    await this.source.waitForPlayout();
  }

  async stop(): Promise<void> {
    this.source?.close();
    if (this.track) {
      try {
        await this.room.localParticipant?.unpublishTrack(this.track.sid ?? "");
      } catch {
        // ignore — best effort during teardown
      }
    }
    this.source = null;
    this.track = null;
  }
}

/**
 * Audio subscriber: captures all remote audio frames into a buffer for
 * later transcription.
 */
export class VoiceSubscriber {
  private buffers: Int16Array[] = [];
  private sampleRate = 0;
  private channels = 0;
  private active = false;
  private streams: AudioStream[] = [];

  constructor(private room: Room) {
    this.room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO) return;
      this.attachToTrack(track as RemoteAudioTrack, participant);
    });
  }

  startCapture(): void {
    this.active = true;
    this.buffers = [];
  }

  /** Stop capturing and return the captured PCM buffer + sample rate. */
  stopCapture(): { samples: Int16Array; sampleRate: number; channels: number } {
    this.active = false;
    if (this.buffers.length === 0 || !this.sampleRate) {
      return { samples: new Int16Array(0), sampleRate: 16000, channels: 1 };
    }
    const total = this.buffers.reduce((n, b) => n + b.length, 0);
    const samples = new Int16Array(total);
    let offset = 0;
    for (const b of this.buffers) {
      samples.set(b, offset);
      offset += b.length;
    }
    return { samples, sampleRate: this.sampleRate, channels: this.channels };
  }

  /** True once any frames have arrived for this capture window. */
  hasFrames(): boolean {
    return this.buffers.length > 0;
  }

  private attachToTrack(track: RemoteAudioTrack, participant: RemoteParticipant): void {
    logger.info(
      { participant: participant.identity },
      "subscriber: attached to remote audio track",
    );
    const stream = new AudioStream(track);
    this.streams.push(stream);

    (async () => {
      for await (const frame of stream) {
        if (!this.active) continue;
        if (!this.sampleRate) {
          this.sampleRate = frame.sampleRate;
          this.channels = frame.channels;
        }
        // frame.data is Int16Array
        this.buffers.push(new Int16Array(frame.data));
      }
    })().catch((err) => {
      logger.warn({ err }, "subscriber stream errored");
    });
  }

  async closeStreams(): Promise<void> {
    // AudioStream is an AsyncIterable; we just drop our references and
    // let the iterator GC. The room.disconnect() will tear down the
    // underlying tracks.
    this.streams = [];
  }
}

/**
 * High-level session: joins a room with both publisher + subscriber.
 */
export class VoiceSession {
  readonly room = new Room();
  readonly subscriber = new VoiceSubscriber(this.room);
  readonly publisher: VoicePublisher;

  constructor(
    private cfg: LiveKitConfig,
    publisherSampleRate = 24000,
  ) {
    this.publisher = new VoicePublisher(this.room, publisherSampleRate);
  }

  async join(opts: JoinRoomOptions): Promise<void> {
    const at = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, {
      identity: opts.identity,
      ...(opts.metadata ? { metadata: opts.metadata } : {}),
    });
    at.addGrant({
      roomJoin: true,
      room: opts.roomName,
      canPublish: true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    await this.room.connect(this.cfg.url, token);
    await this.publisher.start();
    logger.info(
      { room: opts.roomName, identity: opts.identity },
      "voice session joined",
    );
  }

  async leave(): Promise<void> {
    await this.publisher.stop();
    await this.subscriber.closeStreams();
    await this.room.disconnect();
    logger.info("voice session left");
  }
}

/** Build a LiveKitConfig from env. Throws clear error if missing. */
export function liveKitConfigFromEnv(): LiveKitConfig {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    throw new Error(
      "Voice transport not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.",
    );
  }
  return { url, apiKey, apiSecret };
}
