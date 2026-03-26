import { CallManager } from "./CallManager";
import { errorResult, okResult } from "../shared/runtime";
import { SIP_CONFIG_STORAGE_KEY } from "../shared/storage";
import type { RuntimeMessage, RuntimeResult, SoftphoneState } from "../shared/types";

const remoteAudio = document.getElementById("remote-audio");

if (!(remoteAudio instanceof HTMLAudioElement)) {
  throw new Error("Offscreen audio sink element was not found.");
}

const callManager = new CallManager(remoteAudio);

void callManager.reloadConfigFromStorage();

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === "SOFTPHONE_STATE" || message.target !== "offscreen") {
    return;
  }

  void handleOffscreenMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse(errorResult(error)));

  return true;
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !(SIP_CONFIG_STORAGE_KEY in changes)) {
    return;
  }

  void callManager.reloadConfigFromStorage();
});

async function handleOffscreenMessage(
  message: Extract<RuntimeMessage, { target: "offscreen" }>
): Promise<RuntimeResult<SoftphoneState | undefined>> {
  switch (message.type) {
    case "GET_STATE":
      return okResult(callManager.getState());

    case "SYNC_CONFIG":
      await callManager.reloadConfigFromStorage();
      return okResult(callManager.getState());

    case "CONNECT_SOFTPHONE":
      return okResult(await callManager.connect());

    case "DISCONNECT_SOFTPHONE":
      return okResult(callManager.disconnect());

    case "MAKE_CALL":
      return okResult(await callManager.makeCall(message.payload.destination));

    case "ANSWER_CALL":
      return okResult(await callManager.answerCall());

    case "REJECT_CALL":
      return okResult(callManager.rejectCall());

    case "HANG_UP_CALL":
      return okResult(callManager.hangUp());

    case "TOGGLE_HOLD":
      return okResult(callManager.toggleHold());

    case "TOGGLE_MUTE":
      return okResult(callManager.toggleMute());

    case "TRANSFER_CALL":
      return okResult(callManager.transferCall(message.payload.destination));

    case "SEND_DTMF":
      return okResult(callManager.sendDtmf(message.payload.tone));

    default: {
      const exhaustiveCheck: never = message;
      void exhaustiveCheck;
      throw new Error("Unsupported offscreen command.");
    }
  }
}
