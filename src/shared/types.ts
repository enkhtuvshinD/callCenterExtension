export type TransportState = "idle" | "connecting" | "connected" | "disconnected";
export type RegistrationState =
  | "idle"
  | "connecting"
  | "registered"
  | "unregistered"
  | "failed";
export type CallDirection = "incoming" | "outgoing";
export type CallStatus =
  | "ringing"
  | "progress"
  | "active"
  | "held"
  | "ended"
  | "failed";

export interface SipConfig {
  displayName: string;
  sipExtension: string;
  password: string;
  domain: string;
  websocketUrl: string;
  realm: string;
  outboundProxy: string;
  stunServer: string;
  turnServer: string;
  turnUsername: string;
  turnPassword: string;
  autoConnect: boolean;
}

export interface SipConfigSummary {
  displayName: string;
  sipExtension: string;
  domain: string;
  websocketUrl: string;
  realm: string;
  outboundProxy: string;
  autoConnect: boolean;
}

export interface ActiveCall {
  id: string;
  direction: CallDirection;
  remoteIdentity: string;
  status: CallStatus;
  startedAt: string | null;
  isOnHold: boolean;
  isMuted: boolean;
  lastDtmfTone: string | null;
}

export interface SoftphoneState {
  transportState: TransportState;
  registrationState: RegistrationState;
  call: ActiveCall | null;
  hasConfig: boolean;
  hasMicrophonePermission: boolean;
  configSummary: SipConfigSummary | null;
  lastEvent: string;
  error: string | null;
}

export interface RuntimeResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type RuntimeMessage =
  | {
      target: "background";
      type:
        | "GET_STATE"
        | "CONNECT_SOFTPHONE"
        | "DISCONNECT_SOFTPHONE"
        | "ANSWER_CALL"
        | "REJECT_CALL"
        | "HANG_UP_CALL"
        | "TOGGLE_HOLD"
        | "TOGGLE_MUTE"
        | "SYNC_CONFIG";
    }
  | {
      target: "background";
      type: "MAKE_CALL" | "TRANSFER_CALL";
      payload: {
        destination: string;
      };
    }
  | {
      target: "background";
      type: "SEND_DTMF";
      payload: {
        tone: string;
      };
    }
  | {
      target: "background";
      type: "SAVE_CONFIG";
      payload: {
        config: SipConfig;
      };
    }
  | {
      target: "offscreen";
      type:
        | "GET_STATE"
        | "CONNECT_SOFTPHONE"
        | "DISCONNECT_SOFTPHONE"
        | "ANSWER_CALL"
        | "REJECT_CALL"
        | "HANG_UP_CALL"
        | "TOGGLE_HOLD"
        | "TOGGLE_MUTE"
        | "SYNC_CONFIG";
    }
  | {
      target: "offscreen";
      type: "MAKE_CALL" | "TRANSFER_CALL";
      payload: {
        destination: string;
      };
    }
  | {
      target: "offscreen";
      type: "SEND_DTMF";
      payload: {
        tone: string;
      };
    }
  | {
      type: "SOFTPHONE_STATE";
      payload: {
        state: SoftphoneState;
      };
    };

export const defaultSipConfig: SipConfig = {
  displayName: "",
  sipExtension: "",
  password: "",
  domain: "",
  websocketUrl: "",
  realm: "",
  outboundProxy: "",
  stunServer: "",
  turnServer: "",
  turnUsername: "",
  turnPassword: "",
  autoConnect: false
};

export function createInitialSoftphoneState(): SoftphoneState {
  return {
    transportState: "idle",
    registrationState: "idle",
    call: null,
    hasConfig: false,
    hasMicrophonePermission: false,
    configSummary: null,
    lastEvent: "Softphone is idle.",
    error: null
  };
}
