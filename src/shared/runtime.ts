import type { RuntimeMessage, RuntimeResult } from "./types";

export async function sendRuntimeMessage<TData = undefined>(
  message: RuntimeMessage
): Promise<RuntimeResult<TData>> {
  return (await chrome.runtime.sendMessage(message)) as RuntimeResult<TData>;
}

export function okResult<TData = undefined>(data?: TData): RuntimeResult<TData> {
  return data === undefined ? { ok: true } : { ok: true, data };
}

export function errorResult(error: unknown): RuntimeResult<never> {
  if (error instanceof Error) {
    return {
      ok: false,
      error: error.message
    };
  }

  return {
    ok: false,
    error: "Unexpected runtime error."
  };
}

export function isStateUpdateMessage(message: unknown): message is Extract<RuntimeMessage, { type: "SOFTPHONE_STATE" }> {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: string }).type === "SOFTPHONE_STATE"
  );
}
