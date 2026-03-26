import { defaultSipConfig, type SipConfig, type SipConfigSummary } from "./types";

export const SIP_CONFIG_STORAGE_KEY = "pulseDock.sipConfig";

export function normalizeSipConfig(rawConfig: Partial<SipConfig> | null | undefined): SipConfig {
  const mergedConfig = {
    ...defaultSipConfig,
    ...rawConfig
  };

  return {
    displayName: mergedConfig.displayName.trim(),
    sipExtension: mergedConfig.sipExtension.trim(),
    password: mergedConfig.password,
    domain: mergedConfig.domain.trim(),
    websocketUrl: mergedConfig.websocketUrl.trim(),
    realm: mergedConfig.realm.trim(),
    outboundProxy: mergedConfig.outboundProxy.trim(),
    stunServer: mergedConfig.stunServer.trim(),
    turnServer: mergedConfig.turnServer.trim(),
    turnUsername: mergedConfig.turnUsername.trim(),
    turnPassword: mergedConfig.turnPassword,
    autoConnect: Boolean(mergedConfig.autoConnect)
  };
}

export function validateSipConfig(config: SipConfig): string[] {
  const errors: string[] = [];

  if (!config.sipExtension) {
    errors.push("Extension/username is required.");
  }

  if (!config.password) {
    errors.push("Password is required.");
  }

  if (!config.domain) {
    errors.push("Domain is required.");
  }

  if (!config.websocketUrl) {
    errors.push("WebSocket URL is required.");
  }

  if (config.websocketUrl) {
    try {
      const url = new URL(config.websocketUrl);

      if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        errors.push("WebSocket URL must start with ws:// or wss://.");
      }
    } catch (error) {
      void error;
      errors.push("WebSocket URL is invalid.");
    }
  }

  return errors;
}

export function summarizeSipConfig(config: SipConfig | null): SipConfigSummary | null {
  if (!config) {
    return null;
  }

  return {
    displayName: config.displayName,
    sipExtension: config.sipExtension,
    domain: config.domain,
    websocketUrl: config.websocketUrl,
    realm: config.realm,
    outboundProxy: config.outboundProxy,
    autoConnect: config.autoConnect
  };
}

export async function loadSipConfig(): Promise<SipConfig | null> {
  const storedValue = await chrome.storage.local.get(SIP_CONFIG_STORAGE_KEY);
  const rawConfig = storedValue[SIP_CONFIG_STORAGE_KEY] as Partial<SipConfig> | undefined;

  if (!rawConfig) {
    return null;
  }

  return normalizeSipConfig(rawConfig);
}

export async function saveSipConfig(config: SipConfig): Promise<void> {
  await chrome.storage.local.set({
    [SIP_CONFIG_STORAGE_KEY]: normalizeSipConfig(config)
  });
}
