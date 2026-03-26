import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import { sendRuntimeMessage, isStateUpdateMessage } from "../shared/runtime";
import {
  loadSipConfig,
  normalizeSipConfig,
  SIP_CONFIG_STORAGE_KEY,
  summarizeSipConfig,
  validateSipConfig
} from "../shared/storage";
import {
  createInitialSoftphoneState,
  defaultSipConfig,
  type ActiveCall,
  type RuntimeMessage,
  type SipConfig,
  type SoftphoneState
} from "../shared/types";

type BackgroundCommand =
  | {
      target: "background";
      type:
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
    };

interface SipContextValue {
  softphoneState: SoftphoneState;
  sipStatus: SoftphoneState["registrationState"];
  callStatus: ActiveCall["status"] | "idle";
  callDirection: ActiveCall["direction"] | null;
  config: SipConfig;
  savedConfig: SipConfig | null;
  validationErrors: string[];
  hasUnsavedChanges: boolean;
  busyAction: string | null;
  bannerMessage: string | null;
  setConfig: Dispatch<SetStateAction<SipConfig>>;
  setBannerMessage: Dispatch<SetStateAction<string | null>>;
  refreshState: () => Promise<void>;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  saveConfig: () => Promise<boolean>;
  saveAndConnect: () => Promise<boolean>;
  makeCall: (destination: string) => Promise<boolean>;
  answerCall: () => Promise<boolean>;
  rejectCall: () => Promise<boolean>;
  hangUp: () => Promise<boolean>;
  toggleHold: () => Promise<boolean>;
  toggleMute: () => Promise<boolean>;
  transferCall: (destination: string) => Promise<boolean>;
  sendDtmf: (tone: string) => Promise<boolean>;
}

const SipContext = createContext<SipContextValue | null>(null);

export function SipProvider({ children }: { children: ReactNode }) {
  const [softphoneState, setSoftphoneState] = useState<SoftphoneState>(createInitialSoftphoneState());
  const [config, setConfig] = useState<SipConfig>(defaultSipConfig);
  const [savedConfig, setSavedConfig] = useState<SipConfig | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();

    const runtimeMessageListener = (message: unknown) => {
      if (!isStateUpdateMessage(message)) {
        return;
      }

      setSoftphoneState(message.payload.state);
    };

    const storageListener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== "local" || !(SIP_CONFIG_STORAGE_KEY in changes)) {
        return;
      }

      void loadSipConfig().then((nextConfig) => {
        if (!nextConfig) {
          setSavedConfig(null);
          return;
        }

        setSavedConfig(nextConfig);
      });
    };

    chrome.runtime.onMessage.addListener(runtimeMessageListener);
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(runtimeMessageListener);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, []);

  const validationErrors = validateSipConfig(config);
  const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(savedConfig ?? defaultSipConfig);

  async function bootstrap() {
    const [storedConfig, stateResponse] = await Promise.all([
      loadSipConfig(),
      sendRuntimeMessage<SoftphoneState>({
        target: "background",
        type: "GET_STATE"
      })
    ]);

    if (storedConfig) {
      setConfig(storedConfig);
      setSavedConfig(storedConfig);
    }

    if (stateResponse.ok && stateResponse.data) {
      setSoftphoneState(stateResponse.data);
      return;
    }

    if (!stateResponse.ok) {
      setSoftphoneState((currentState) => ({
        ...currentState,
        error: stateResponse.error ?? "Could not load runtime state."
      }));
    }
  }

  async function refreshState(): Promise<void> {
    const response = await sendRuntimeMessage<SoftphoneState>({
      target: "background",
      type: "GET_STATE"
    });

    if (!response.ok) {
      setBannerMessage(response.error ?? "Could not refresh SIP state.");
      return;
    }

    if (response.data) {
      setSoftphoneState(response.data);
    }
  }

  async function runBackgroundCommand(
    command: BackgroundCommand,
    busyLabel?: string
  ): Promise<boolean> {
    if (busyLabel) {
      setBusyAction(busyLabel);
    }

    setBannerMessage(null);

    const response = await sendRuntimeMessage<SoftphoneState>(command as RuntimeMessage);

    if (busyLabel) {
      setBusyAction(null);
    }

    if (!response.ok) {
      setBannerMessage(response.error ?? "The action could not be completed.");
      return false;
    }

    if (response.data) {
      setSoftphoneState(response.data);
    }

    return true;
  }

  async function save(connectAfterSave = false): Promise<boolean> {
    const normalizedConfig = normalizeSipConfig(config);
    const errors = validateSipConfig(normalizedConfig);

    if (errors.length > 0) {
      setBannerMessage(errors[0]);
      return false;
    }

    setBusyAction(connectAfterSave ? "save-connect" : "save");
    setBannerMessage(null);

    const saveResponse = await sendRuntimeMessage({
      target: "background",
      type: "SAVE_CONFIG",
      payload: {
        config: normalizedConfig
      }
    });

    if (!saveResponse.ok) {
      setBusyAction(null);
      setBannerMessage(saveResponse.error ?? "Settings could not be saved.");
      return false;
    }

    setConfig(normalizedConfig);
    setSavedConfig(normalizedConfig);
    setSoftphoneState((currentState) => ({
      ...currentState,
      hasConfig: true,
      configSummary: summarizeSipConfig(normalizedConfig),
      error: null
    }));

    if (connectAfterSave) {
      const connectResponse = await sendRuntimeMessage<SoftphoneState>({
        target: "background",
        type: "CONNECT_SOFTPHONE"
      });

      setBusyAction(null);

      if (!connectResponse.ok) {
        setBannerMessage(connectResponse.error ?? "Could not connect after saving.");
        return false;
      }

      if (connectResponse.data) {
        setSoftphoneState(connectResponse.data);
      }

      setBannerMessage("Configuration saved and connect requested.");
      return true;
    }

    setBusyAction(null);
    setBannerMessage("Configuration saved.");
    return true;
  }

  async function connect(): Promise<boolean> {
    if (!savedConfig) {
      setBannerMessage("Save a SIP configuration before connecting.");
      return false;
    }

    if (hasUnsavedChanges) {
      setBannerMessage("You have unsaved SIP settings. Save them before connecting.");
      return false;
    }

    return runBackgroundCommand(
      {
        target: "background",
        type: "CONNECT_SOFTPHONE"
      },
      "connect"
    );
  }

  async function disconnect(): Promise<boolean> {
    return runBackgroundCommand(
      {
        target: "background",
        type: "DISCONNECT_SOFTPHONE"
      },
      "disconnect"
    );
  }

  async function makeCall(destination: string): Promise<boolean> {
    const normalizedDestination = destination.trim();

    if (!normalizedDestination) {
      setBannerMessage("Destination is required.");
      return false;
    }

    return runBackgroundCommand(
      {
        target: "background",
        type: "MAKE_CALL",
        payload: {
          destination: normalizedDestination
        }
      },
      "dial"
    );
  }

  async function answerCall(): Promise<boolean> {
    return runBackgroundCommand(
      {
        target: "background",
        type: "ANSWER_CALL"
      },
      "answer"
    );
  }

  async function rejectCall(): Promise<boolean> {
    return runBackgroundCommand(
      {
        target: "background",
        type: "REJECT_CALL"
      },
      "reject"
    );
  }

  async function hangUp(): Promise<boolean> {
    return runBackgroundCommand(
      {
        target: "background",
        type: "HANG_UP_CALL"
      },
      "hangup"
    );
  }

  async function toggleHold(): Promise<boolean> {
    return runBackgroundCommand(
      {
        target: "background",
        type: "TOGGLE_HOLD"
      },
      "hold"
    );
  }

  async function toggleMute(): Promise<boolean> {
    return runBackgroundCommand(
      {
        target: "background",
        type: "TOGGLE_MUTE"
      },
      "mute"
    );
  }

  async function transferCall(destination: string): Promise<boolean> {
    const normalizedDestination = destination.trim();

    if (!normalizedDestination) {
      setBannerMessage("Transfer destination is required.");
      return false;
    }

    return runBackgroundCommand(
      {
        target: "background",
        type: "TRANSFER_CALL",
        payload: {
          destination: normalizedDestination
        }
      },
      "transfer"
    );
  }

  async function sendDtmf(tone: string): Promise<boolean> {
    const normalizedTone = tone.trim().toUpperCase();

    if (!normalizedTone) {
      setBannerMessage("DTMF tone is required.");
      return false;
    }

    setBannerMessage(null);

    const response = await sendRuntimeMessage<SoftphoneState>({
      target: "background",
      type: "SEND_DTMF",
      payload: {
        tone: normalizedTone
      }
    });

    if (!response.ok) {
      setBannerMessage(response.error ?? "The DTMF tone could not be sent.");
      return false;
    }

    if (response.data) {
      setSoftphoneState(response.data);
    }

    return true;
  }

  return (
    <SipContext.Provider
      value={{
        softphoneState,
        sipStatus: softphoneState.registrationState,
        callStatus: softphoneState.call?.status ?? "idle",
        callDirection: softphoneState.call?.direction ?? null,
        config,
        savedConfig,
        validationErrors,
        hasUnsavedChanges,
        busyAction,
        bannerMessage,
        setConfig,
        setBannerMessage,
        refreshState,
        connect,
        disconnect,
        saveConfig: () => save(false),
        saveAndConnect: () => save(true),
        makeCall,
        answerCall,
        rejectCall,
        hangUp,
        toggleHold,
        toggleMute,
        transferCall,
        sendDtmf
      }}
    >
      {children}
    </SipContext.Provider>
  );
}

export function useSip() {
  const context = useContext(SipContext);

  if (!context) {
    throw new Error("useSip must be used inside SipProvider.");
  }

  return context;
}
