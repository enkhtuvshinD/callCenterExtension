import { websocketUrlToPermissionOrigin } from "../shared/permissions";
import { errorResult, okResult } from "../shared/runtime";
import { loadSipConfig, saveSipConfig, validateSipConfig } from "../shared/storage";
import {
  createInitialSoftphoneState,
  type RuntimeMessage,
  type RuntimeResult,
  type SoftphoneState
} from "../shared/types";

const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let offscreenCreation: Promise<void> | null = null;
let latestState: SoftphoneState = createInitialSoftphoneState();

chrome.runtime.onInstalled.addListener(() => {
  void initializeSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeSidePanel();
  void autoConnectIfEligible();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === "SOFTPHONE_STATE") {
    latestState = message.payload.state;
    void syncBadge(message.payload.state);
    return;
  }

  if (message.target !== "background") {
    return;
  }

  void handleBackgroundMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse(errorResult(error)));

  return true;
});

async function handleBackgroundMessage(
  message: Extract<RuntimeMessage, { target: "background" }>,
  sender: chrome.runtime.MessageSender
): Promise<RuntimeResult<SoftphoneState | undefined>> {
  switch (message.type) {
    case "SAVE_CONFIG": {
      const config = message.payload.config;
      const validationErrors = validateSipConfig(config);

      if (validationErrors.length > 0) {
        throw new Error(validationErrors[0]);
      }

      await saveSipConfig(config);
      await ensureOffscreenDocument();
      await forwardToOffscreen({
        target: "offscreen",
        type: "SYNC_CONFIG"
      });

      return okResult();
    }

    case "GET_STATE": {
      await ensureOffscreenDocument();
      return forwardToOffscreen({
        target: "offscreen",
        type: "GET_STATE"
      });
    }

    case "CONNECT_SOFTPHONE": {
      const config = await loadSipConfig();

      if (!config) {
        throw new Error("Save a SIP configuration before connecting.");
      }

      const permissionOrigin = websocketUrlToPermissionOrigin(config.websocketUrl);

      if (!permissionOrigin) {
        throw new Error("Configured WebSocket URL is invalid.");
      }

      const hasPermission = await chrome.permissions.contains({
        origins: [permissionOrigin]
      });

      if (!hasPermission) {
        const granted = await chrome.permissions.request({
          origins: [permissionOrigin]
        });

        if (!granted) {
          throw new Error("Host access for the SIP WebSocket origin was not granted.");
        }
      }

      await ensureOffscreenDocument();
      return forwardToOffscreen({
        target: "offscreen",
        type: "CONNECT_SOFTPHONE"
      });
    }

    case "DISCONNECT_SOFTPHONE":
    case "ANSWER_CALL":
    case "REJECT_CALL":
    case "HANG_UP_CALL":
    case "TOGGLE_HOLD":
    case "TOGGLE_MUTE":
    case "SYNC_CONFIG": {
      await ensureOffscreenDocument();
      return forwardToOffscreen({
        target: "offscreen",
        type: message.type
      });
    }

    case "MAKE_CALL":
    case "TRANSFER_CALL": {
      await ensureOffscreenDocument();
      return forwardToOffscreen({
        target: "offscreen",
        type: message.type,
        payload: message.payload
      });
    }

    case "SEND_DTMF": {
      await ensureOffscreenDocument();
      return forwardToOffscreen({
        target: "offscreen",
        type: "SEND_DTMF",
        payload: message.payload
      });
    }

    default: {
      const exhaustiveCheck: never = message;
      void exhaustiveCheck;
      throw new Error("Unsupported background message.");
    }
  }
}

async function initializeSidePanel(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  });

  await chrome.sidePanel.setOptions({
    path: "sidepanel.html",
    enabled: true
  });
}

async function autoConnectIfEligible(): Promise<void> {
  const config = await loadSipConfig();

  if (!config?.autoConnect) {
    return;
  }

  const permissionOrigin = websocketUrlToPermissionOrigin(config.websocketUrl);

  if (!permissionOrigin) {
    return;
  }

  const hasPermission = await chrome.permissions.contains({
    origins: [permissionOrigin]
  });

  if (!hasPermission) {
    return;
  }

  await ensureOffscreenDocument();
  await forwardToOffscreen({
    target: "offscreen",
    type: "CONNECT_SOFTPHONE"
  });
}

async function ensureOffscreenDocument(): Promise<void> {
  const runtimeWithContexts = chrome.runtime as typeof chrome.runtime & {
    getContexts?: (options?: {
      contextTypes?: string[];
      documentUrls?: string[];
    }) => Promise<Array<{ contextType: string }>>;
  };

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);

  if (typeof runtimeWithContexts.getContexts === "function") {
    const existingContexts = await runtimeWithContexts.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
      return;
    }
  }

  if (!offscreenCreation) {
    offscreenCreation = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["USER_MEDIA", "WEB_RTC", "AUDIO_PLAYBACK"] as never,
        justification:
          "Maintain JsSIP registration, WebRTC media and remote audio while the side panel UI is not visible."
      })
      .finally(() => {
        offscreenCreation = null;
      });
  }

  await offscreenCreation;
}

async function forwardToOffscreen(
  message: Extract<RuntimeMessage, { target: "offscreen" }>
): Promise<RuntimeResult<SoftphoneState | undefined>> {
  return (await chrome.runtime.sendMessage(message)) as RuntimeResult<SoftphoneState | undefined>;
}

async function syncBadge(state: SoftphoneState): Promise<void> {
  if (state.call?.direction === "incoming" && state.call.status === "ringing") {
    await chrome.action.setBadgeBackgroundColor({ color: "#8b1e2d" });
    await chrome.action.setBadgeText({ text: "RING" });
    return;
  }

  if (state.call?.status === "active" || state.call?.status === "held") {
    await chrome.action.setBadgeBackgroundColor({ color: "#185b8d" });
    await chrome.action.setBadgeText({ text: "LIVE" });
    return;
  }

  if (state.registrationState === "registered") {
    await chrome.action.setBadgeBackgroundColor({ color: "#236a4d" });
    await chrome.action.setBadgeText({ text: "ON" });
    return;
  }

  if (state.registrationState === "failed") {
    await chrome.action.setBadgeBackgroundColor({ color: "#7a2f16" });
    await chrome.action.setBadgeText({ text: "ERR" });
    return;
  }

  await chrome.action.setBadgeText({ text: "" });
}
