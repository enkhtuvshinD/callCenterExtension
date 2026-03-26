import JsSIP, { type RTCSession, type UA } from "jssip";
import { loadSipConfig, summarizeSipConfig } from "../shared/storage";
import {
  createInitialSoftphoneState,
  type ActiveCall,
  type SipConfig,
  type SoftphoneState
} from "../shared/types";

export class CallManager {
  private config: SipConfig | null = null;
  private readonly remoteAudio: HTMLAudioElement;
  private state: SoftphoneState = createInitialSoftphoneState();
  private session: RTCSession | null = null;
  private userAgent: UA | null = null;
  private readonly trackedPeerConnections = new WeakSet<RTCPeerConnection>();

  constructor(remoteAudio: HTMLAudioElement) {
    this.remoteAudio = remoteAudio;
    this.remoteAudio.autoplay = true;
  }

  async reloadConfigFromStorage(): Promise<void> {
    this.config = await loadSipConfig();
    this.patchState({
      hasConfig: Boolean(this.config),
      configSummary: summarizeSipConfig(this.config),
      lastEvent: this.config ? "Configuration loaded." : "Save SIP credentials to start registration."
    });
  }

  getState(): SoftphoneState {
    return {
      ...this.state,
      call: this.state.call ? { ...this.state.call } : null,
      configSummary: this.state.configSummary ? { ...this.state.configSummary } : null
    };
  }

  async connect(): Promise<SoftphoneState> {
    if (!this.config) {
      await this.reloadConfigFromStorage();
    }

    if (!this.config) {
      throw new Error("No SIP configuration is available.");
    }

    await this.ensureMicrophonePermission();

    if (this.userAgent) {
      this.disconnect(false);
    }

    this.patchState({
      transportState: "connecting",
      registrationState: "connecting",
      error: null,
      lastEvent: "Connecting to SIP WebSocket..."
    });

    const socket = new JsSIP.WebSocketInterface(this.config.websocketUrl);
    const userAgentConfiguration: Record<string, unknown> = {
      sockets: [socket],
      uri: this.buildSipTarget(this.config.sipExtension),
      password: this.config.password,
      authorization_user: this.config.sipExtension,
      display_name: this.config.displayName || this.config.sipExtension,
      session_timers: false
    };

    if (this.config.realm) {
      userAgentConfiguration.realm = this.config.realm;
    }

    if (this.config.outboundProxy) {
      userAgentConfiguration.registrar_server = this.config.outboundProxy.startsWith("sip:")
        ? this.config.outboundProxy
        : `sip:${this.config.outboundProxy}`;
    }

    const iceServers = this.buildIceServers();

    if (iceServers.length > 0) {
      userAgentConfiguration.pcConfig = { iceServers };
    }

    this.userAgent = new JsSIP.UA(userAgentConfiguration);
    this.bindUserAgentEvents(this.userAgent);
    this.userAgent.start();
    console.log(this.userAgent,'this.userAgent')
    return this.getState();
  }

  disconnect(updateEvent = true): SoftphoneState {
    this.session = null;
    this.remoteAudio.srcObject = null;

    if (this.userAgent) {
      this.userAgent.stop();
      this.userAgent = null;
    }

    this.patchState({
      call: null,
      transportState: "disconnected",
      registrationState: "unregistered",
      lastEvent: updateEvent ? "Disconnected from SIP transport." : this.state.lastEvent
    });

    return this.getState();
  }

  async makeCall(destination: string): Promise<SoftphoneState> {
    if (!this.userAgent || !this.config) {
      throw new Error("Softphone is not connected.");
    }

    await this.ensureMicrophonePermission();

    const target = this.buildDialTarget(destination);
    const options: Record<string, unknown> = {
      mediaConstraints: {
        audio: true,
        video: false
      },
      pcConfig: {
        iceServers: this.buildIceServers()
      }
    };

    this.patchState({
      error: null,
      lastEvent: `Dialing ${destination}...`
    });

    this.userAgent.call(target, options);
    return this.getState();
  }

  async answerCall(): Promise<SoftphoneState> {
    if (!this.session) {
      throw new Error("There is no active incoming call to answer.");
    }

    await this.ensureMicrophonePermission();

    this.session.answer({
      mediaConstraints: {
        audio: true,
        video: false
      },
      pcConfig: {
        iceServers: this.buildIceServers()
      }
    });

    this.patchCall({
      status: "active",
      startedAt: new Date().toISOString()
    });
    this.patchState({
      lastEvent: "Answered call."
    });

    return this.getState();
  }

  rejectCall(): SoftphoneState {
    if (!this.session) {
      throw new Error("There is no incoming call to reject.");
    }

    this.session.terminate({
      status_code: 486,
      reason_phrase: "Busy Here"
    });
    this.finishCall("Call rejected.");
    return this.getState();
  }

  hangUp(): SoftphoneState {
    if (!this.session) {
      throw new Error("There is no active call to hang up.");
    }

    this.session.terminate();
    this.finishCall("Call ended.");
    return this.getState();
  }

  toggleHold(): SoftphoneState {
    if (!this.session || !this.state.call) {
      throw new Error("There is no active call to hold.");
    }

    if (this.state.call.isOnHold) {
      this.session.unhold();
      this.patchCall({
        isOnHold: false,
        status: "active"
      });
      this.patchState({
        lastEvent: "Call resumed."
      });
      return this.getState();
    }

    this.session.hold();
    this.patchCall({
      isOnHold: true,
      status: "held"
    });
    this.patchState({
      lastEvent: "Call placed on hold."
    });
    return this.getState();
  }

  toggleMute(): SoftphoneState {
    if (!this.session || !this.state.call) {
      throw new Error("There is no active call to mute.");
    }

    if (this.state.call.isMuted) {
      this.session.unmute({
        audio: true
      });
      this.patchCall({
        isMuted: false
      });
      this.patchState({
        lastEvent: "Microphone unmuted."
      });
      return this.getState();
    }

    this.session.mute({
      audio: true
    });
    this.patchCall({
      isMuted: true
    });
    this.patchState({
      lastEvent: "Microphone muted."
    });
    return this.getState();
  }

  transferCall(destination: string): SoftphoneState {
    if (!this.session) {
      throw new Error("There is no active call to transfer.");
    }

    const target = this.buildDialTarget(destination);

    this.session.refer(target, {
      eventHandlers: {
        requestSucceeded: () => {
          this.patchState({
            lastEvent: `Transfer request accepted for ${destination}.`,
            error: null
          });
        },
        requestFailed: (event: { cause?: string }) => {
          this.patchState({
            error: event.cause ?? "Transfer request failed.",
            lastEvent: "Transfer failed."
          });
        }
      }
    });

    this.patchState({
      lastEvent: `Transferring call to ${destination}...`,
      error: null
    });

    return this.getState();
  }

  sendDtmf(tone: string): SoftphoneState {
    if (!this.session || !this.state.call) {
      throw new Error("There is no active call for DTMF.");
    }

    if (this.state.call.status !== "active" && this.state.call.status !== "held") {
      throw new Error("DTMF is only available after the call is connected.");
    }

    const normalizedTone = tone.trim().toUpperCase();

    if (!/^[0-9A-D*#]$/.test(normalizedTone)) {
      throw new Error("DTMF tone must be a single digit, *, #, or A-D.");
    }

    this.session.sendDTMF(normalizedTone);
    this.patchCall({
      lastDtmfTone: normalizedTone
    });
    this.patchState({
      error: null,
      lastEvent: `Sent DTMF tone ${normalizedTone}.`
    });

    return this.getState();
  }

  private bindUserAgentEvents(userAgent: UA): void {
    userAgent.on("connecting", () => {
      this.patchState({
        transportState: "connecting",
        registrationState: "connecting",
        lastEvent: "WebSocket transport is connecting..."
      });
    });

    userAgent.on("connected", () => {
      this.patchState({
        transportState: "connected",
        lastEvent: "WebSocket transport connected."
      });
    });

    userAgent.on("disconnected", () => {
      this.patchState({
        transportState: "disconnected",
        registrationState: "unregistered",
        lastEvent: "WebSocket transport disconnected."
      });
    });

    userAgent.on("registered", () => {
      this.patchState({
        registrationState: "registered",
        transportState: "connected",
        error: null,
        lastEvent: "Registered with SIP server."
      });
    });

    userAgent.on("unregistered", () => {
      this.patchState({
        registrationState: "unregistered",
        lastEvent: "Registration removed."
      });
    });

    userAgent.on("registrationFailed", (event: { cause?: string }) => {
      this.patchState({
        registrationState: "failed",
        transportState: "disconnected",
        error: event.cause ?? "Registration failed.",
        lastEvent: "Registration failed."
      });
    });

    userAgent.on("newRTCSession", (event: { originator: "local" | "remote"; session: RTCSession }) => {
      this.bindSession(event.session, event.originator);
    });
  }

  private bindSession(session: RTCSession, originator: "local" | "remote"): void {
    this.session = session;
    this.bindPeerConnection(session);

    const call: ActiveCall = {
      id: session.id ?? crypto.randomUUID(),
      direction: originator === "remote" ? "incoming" : "outgoing",
      remoteIdentity: this.describeRemoteParty(session),
      status: originator === "remote" ? "ringing" : "progress",
      startedAt: null,
      isOnHold: false,
      isMuted: false,
      lastDtmfTone: null
    };

    this.patchState({
      call,
      error: null,
      lastEvent:
        originator === "remote"
          ? `Incoming call from ${call.remoteIdentity}.`
          : `Outgoing call to ${call.remoteIdentity}.`
    });

    session.on("progress", () => {
      this.patchCall({
        status: "progress"
      });
      this.patchState({
        lastEvent: "Call is progressing..."
      });
    });

    session.on("accepted", () => {
      this.patchCall({
        status: "active",
        startedAt: this.state.call?.startedAt ?? new Date().toISOString()
      });
      this.patchState({
        lastEvent: "Call accepted."
      });
      void this.remoteAudio.play().catch(() => undefined);
    });

    session.on("confirmed", () => {
      this.patchCall({
        status: this.state.call?.isOnHold ? "held" : "active",
        startedAt: this.state.call?.startedAt ?? new Date().toISOString()
      });
      this.patchState({
        lastEvent: "Media session established."
      });
      void this.remoteAudio.play().catch(() => undefined);
    });

    session.on("hold", () => {
      this.patchCall({
        status: "held",
        isOnHold: true
      });
      this.patchState({
        lastEvent: "Call placed on hold."
      });
    });

    session.on("unhold", () => {
      this.patchCall({
        status: "active",
        isOnHold: false
      });
      this.patchState({
        lastEvent: "Call resumed."
      });
    });

    session.on("muted", () => {
      this.patchCall({
        isMuted: true
      });
      this.patchState({
        lastEvent: "Microphone muted."
      });
    });

    session.on("unmuted", () => {
      this.patchCall({
        isMuted: false
      });
      this.patchState({
        lastEvent: "Microphone unmuted."
      });
    });

    session.on("ended", () => {
      this.finishCall("Call ended.");
    });

    session.on("failed", (event: { cause?: string }) => {
      this.finishCall("Call failed.", event.cause ?? "Session failed.");
    });
  }

  private bindPeerConnection(session: RTCSession): void {
    const attachToPeerConnection = (peerConnection: RTCPeerConnection | undefined) => {
      if (!peerConnection || this.trackedPeerConnections.has(peerConnection)) {
        return;
      }

      this.trackedPeerConnections.add(peerConnection);
      peerConnection.addEventListener("track", (event) => {
        const mediaStream =
          event.streams[0] ?? new MediaStream(event.track.kind === "audio" ? [event.track] : []);

        this.remoteAudio.srcObject = mediaStream;
        void this.remoteAudio.play().catch(() => undefined);
      });
    };

    attachToPeerConnection(session.connection);

    session.on("peerconnection", (event: { peerconnection?: RTCPeerConnection }) => {
      attachToPeerConnection(event.peerconnection);
    });
  }

  private buildSipTarget(identity: string): string {
    return `sip:${identity}@${this.config?.domain ?? ""}`;
  }

  private buildDialTarget(destination: string): string {
    const trimmedDestination = destination.trim();

    if (trimmedDestination.startsWith("sip:")) {
      return trimmedDestination;
    }

    if (trimmedDestination.includes("@")) {
      return `sip:${trimmedDestination}`;
    }

    return this.buildSipTarget(trimmedDestination);
  }

  private buildIceServers(): RTCIceServer[] {
    if (!this.config) {
      return [];
    }

    const iceServers: RTCIceServer[] = [];

    if (this.config.stunServer) {
      iceServers.push({
        urls: this.config.stunServer.startsWith("stun:")
          ? this.config.stunServer
          : `stun:${this.config.stunServer}`
      });
    }

    if (this.config.turnServer) {
      iceServers.push({
        urls: this.config.turnServer.startsWith("turn")
          ? this.config.turnServer
          : `turn:${this.config.turnServer}`,
        username: this.config.turnUsername || undefined,
        credential: this.config.turnPassword || undefined
      });
    }

    return iceServers;
  }

  private async ensureMicrophonePermission(): Promise<void> {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    mediaStream.getTracks().forEach((track) => {
      track.stop();
    });

    this.patchState({
      hasMicrophonePermission: true,
      error: null
    });
  }

  private describeRemoteParty(session: RTCSession): string {
    const displayName = session.remote_identity?.display_name?.trim();

    if (displayName) {
      return displayName;
    }

    const user = session.remote_identity?.uri?.user?.trim();
    const host = session.remote_identity?.uri?.host?.trim();

    if (user && host) {
      return `${user}@${host}`;
    }

    return session.remote_identity?.uri?.toString() ?? "Unknown party";
  }

  private patchState(partialState: Partial<SoftphoneState>): void {
    this.state = {
      ...this.state,
      ...partialState
    };

    this.publishState();
  }

  private patchCall(partialCall: Partial<ActiveCall>): void {
    if (!this.state.call) {
      return;
    }

    this.state = {
      ...this.state,
      call: {
        ...this.state.call,
        ...partialCall
      }
    };

    this.publishState();
  }

  private finishCall(lastEvent: string, error: string | null = null): void {
    this.session = null;
    this.remoteAudio.srcObject = null;
    this.patchState({
      call: null,
      error,
      lastEvent
    });
  }

  private publishState(): void {
    void chrome.runtime
      .sendMessage({
        type: "SOFTPHONE_STATE",
        payload: {
          state: this.getState()
        }
      })
      .catch(() => undefined);
  }
}
