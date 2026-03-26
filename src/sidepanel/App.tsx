import { useEffect, useState } from "react";
import type { SoftphoneState } from "../shared/types";
import { useSip } from "./SipProvider";

type PanelView = "console" | "settings";

type TonePadKey = {
  tone: string;
  letters: string;
};

const TONE_PAD_KEYS: TonePadKey[] = [
  { tone: "1", letters: "" },
  { tone: "2", letters: "ABC" },
  { tone: "3", letters: "DEF" },
  { tone: "4", letters: "GHI" },
  { tone: "5", letters: "JKL" },
  { tone: "6", letters: "MNO" },
  { tone: "7", letters: "PQRS" },
  { tone: "8", letters: "TUV" },
  { tone: "9", letters: "WXYZ" },
  { tone: "*", letters: "" },
  { tone: "0", letters: "+" },
  { tone: "#", letters: "" }
];

export function App() {
  const {
    softphoneState,
    config,
    savedConfig,
    validationErrors,
    hasUnsavedChanges,
    busyAction,
    bannerMessage,
    setConfig,
    connect,
    disconnect,
    saveConfig,
    saveAndConnect,
    makeCall,
    answerCall,
    rejectCall,
    hangUp,
    toggleHold,
    toggleMute,
    transferCall,
    sendDtmf
  } = useSip();

  const [dialDestination, setDialDestination] = useState("");
  const [transferDestination, setTransferDestination] = useState("");
  const [activeView, setActiveView] = useState<PanelView>("console");
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!softphoneState.call?.startedAt) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [softphoneState.call?.startedAt]);

  const callDuration = formatCallDuration(softphoneState.call?.startedAt, currentTime);
  const connectionLabel = getConnectionLabel(softphoneState);
  const canPlaceCall =
    softphoneState.registrationState === "registered" &&
    !softphoneState.call &&
    dialDestination.trim().length > 0;
  const canSendDtmf = Boolean(
    softphoneState.call &&
      (softphoneState.call.status === "active" || softphoneState.call.status === "held")
  );

  async function handleSaveAndConnect() {
    const didConnect = await saveAndConnect();

    if (didConnect) {
      setActiveView("console");
    }
  }

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div>
          <p className="eyebrow">React Side Panel Softphone</p>
          <h1>PulseDock</h1>
        </div>
        <span className={`status-pill status-${softphoneState.registrationState}`}>{connectionLabel}</span>
      </div>

      <div className="panel-switcher">
        <button
          type="button"
          className={activeView === "console" ? "tab-button active" : "tab-button"}
          onClick={() => setActiveView("console")}
        >
          Console
        </button>
        <button
          type="button"
          className={activeView === "settings" ? "tab-button active" : "tab-button"}
          onClick={() => setActiveView("settings")}
        >
          Settings
        </button>
      </div>

      {bannerMessage ? <div className="banner">{bannerMessage}</div> : null}

      {activeView === "console" ? (
        <main className="content-stack">
          <section className="hero-card">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>{softphoneState.call ? softphoneState.call.remoteIdentity : "Ready for calls"}</h2>
              <p className="muted">
                {softphoneState.call
                  ? `${softphoneState.call.direction} · ${softphoneState.call.status}`
                  : softphoneState.lastEvent}
              </p>
            </div>

            <div className="hero-meta">
              <div>
                <span className="meta-label">Transport</span>
                <strong>{softphoneState.transportState}</strong>
              </div>
              <div>
                <span className="meta-label">Mic</span>
                <strong>{softphoneState.hasMicrophonePermission ? "Granted" : "Pending"}</strong>
              </div>
              {callDuration ? (
                <div>
                  <span className="meta-label">Live</span>
                  <strong>{callDuration}</strong>
                </div>
              ) : null}
            </div>

            <div className="button-row">
              {softphoneState.registrationState === "registered" ? (
                <button
                  type="button"
                  className="primary-button danger"
                  disabled={busyAction !== null}
                  onClick={() => void disconnect()}
                >
                  {busyAction === "disconnect" ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled={busyAction !== null || !savedConfig || hasUnsavedChanges}
                  onClick={() => void connect()}
                >
                  {busyAction === "connect" ? "Connecting..." : "Connect"}
                </button>
              )}

              <button
                type="button"
                className="secondary-button"
                disabled={busyAction !== null}
                onClick={() => setActiveView("settings")}
              >
                Edit SIP Settings
              </button>
            </div>

            {hasUnsavedChanges ? (
              <p className="hint-text">You have unsaved SIP settings. Save them before connecting.</p>
            ) : null}
            {!savedConfig ? (
              <p className="hint-text">No SIP credentials saved yet. Open Settings to configure the extension.</p>
            ) : null}
          </section>

          <section className="surface-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Dialer</p>
                <h3>Outbound call</h3>
              </div>
              {softphoneState.configSummary ? (
                <span className="config-chip">
                  {softphoneState.configSummary.sipExtension}@{softphoneState.configSummary.domain}
                </span>
              ) : null}
            </div>

            <label className="field">
              <span>Destination</span>
              <input
                value={dialDestination}
                onChange={(event) => setDialDestination(event.target.value)}
                placeholder="1001 or sip:1001@pbx.local"
              />
            </label>

            <TonePad
              disabled={busyAction !== null}
              onPress={(tone) => setDialDestination((current) => `${current}${tone}`)}
            />

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={!canPlaceCall || busyAction !== null}
                onClick={() => void makeCall(dialDestination)}
              >
                {busyAction === "dial" ? "Calling..." : "Call"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busyAction !== null || dialDestination.length === 0}
                onClick={() => setDialDestination("")}
              >
                Clear
              </button>
            </div>
          </section>

          <section className="surface-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Call Controls</p>
                <h3>{softphoneState.call ? softphoneState.call.remoteIdentity : "No active call"}</h3>
              </div>
              {softphoneState.call ? (
                <span className={`call-chip call-${softphoneState.call.status}`}>{softphoneState.call.status}</span>
              ) : null}
            </div>

            {softphoneState.call ? (
              <>
                <div className="call-grid">
                  <div>
                    <span className="meta-label">Direction</span>
                    <strong>{softphoneState.call.direction}</strong>
                  </div>
                  <div>
                    <span className="meta-label">Muted</span>
                    <strong>{softphoneState.call.isMuted ? "Yes" : "No"}</strong>
                  </div>
                  <div>
                    <span className="meta-label">On Hold</span>
                    <strong>{softphoneState.call.isOnHold ? "Yes" : "No"}</strong>
                  </div>
                </div>

                <div className="button-row">
                  {softphoneState.call.direction === "incoming" &&
                  softphoneState.call.status === "ringing" ? (
                    <>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busyAction !== null}
                        onClick={() => void answerCall()}
                      >
                        {busyAction === "answer" ? "Answering..." : "Answer"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button danger"
                        disabled={busyAction !== null}
                        onClick={() => void rejectCall()}
                      >
                        {busyAction === "reject" ? "Rejecting..." : "Reject"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busyAction !== null}
                        onClick={() => void toggleHold()}
                      >
                        {softphoneState.call.isOnHold ? "Resume" : "Hold"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busyAction !== null}
                        onClick={() => void toggleMute()}
                      >
                        {softphoneState.call.isMuted ? "Unmute" : "Mute"}
                      </button>
                      <button
                        type="button"
                        className="primary-button danger"
                        disabled={busyAction !== null}
                        onClick={() => void hangUp()}
                      >
                        {busyAction === "hangup" ? "Ending..." : "Hang Up"}
                      </button>
                    </>
                  )}
                </div>

                {canSendDtmf ? (
                  <>
                    <label className="field">
                      <span>Blind transfer target</span>
                      <input
                        value={transferDestination}
                        onChange={(event) => setTransferDestination(event.target.value)}
                        placeholder="2002"
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busyAction !== null || transferDestination.trim().length === 0}
                      onClick={() => void transferCall(transferDestination)}
                    >
                      {busyAction === "transfer" ? "Transferring..." : "Transfer"}
                    </button>

                    <div className="subsection-stack">
                      <div className="subsection-header">
                        <div>
                          <span className="meta-label">In-call keypad</span>
                          <strong>DTMF</strong>
                        </div>
                        <span className="dtmf-readout">
                          {softphoneState.call.lastDtmfTone
                            ? `Last tone ${softphoneState.call.lastDtmfTone}`
                            : "No tones sent"}
                        </span>
                      </div>

                      <TonePad disabled={busyAction !== null} onPress={(tone) => void sendDtmf(tone)} />
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <p className="muted">
                Incoming calls, active-call state, mute/hold/transfer controls will appear here.
              </p>
            )}
          </section>

          <section className="surface-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Activity</p>
                <h3>Latest event</h3>
              </div>
            </div>
            <p className="activity-text">{softphoneState.lastEvent}</p>
            {softphoneState.error ? <p className="error-text">{softphoneState.error}</p> : null}
          </section>
        </main>
      ) : (
        <main className="content-stack">
          <section className="surface-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Identity</p>
                <h3>SIP account</h3>
              </div>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Display name</span>
                <input
                  value={config.displayName}
                  onChange={(event) => setConfig((current) => ({ ...current, displayName: event.target.value }))}
                  placeholder="Agent 101"
                />
              </label>

              <label className="field">
                <span>Extension / username</span>
                <input
                  value={config.sipExtension}
                  onChange={(event) => setConfig((current) => ({ ...current, sipExtension: event.target.value }))}
                  placeholder="1001"
                />
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  value={config.password}
                  onChange={(event) => setConfig((current) => ({ ...current, password: event.target.value }))}
                  placeholder="SIP password"
                />
              </label>

              <label className="field">
                <span>Domain</span>
                <input
                  value={config.domain}
                  onChange={(event) => setConfig((current) => ({ ...current, domain: event.target.value }))}
                  placeholder="pbx.example.com"
                />
              </label>
            </div>

            <label className="field">
              <span>WebSocket URL</span>
              <input
                value={config.websocketUrl}
                onChange={(event) => setConfig((current) => ({ ...current, websocketUrl: event.target.value }))}
                placeholder="wss://pbx.example.com:8089/ws"
              />
            </label>
          </section>

          <section className="surface-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Advanced</p>
                <h3>Proxy and ICE</h3>
              </div>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Realm</span>
                <input
                  value={config.realm}
                  onChange={(event) => setConfig((current) => ({ ...current, realm: event.target.value }))}
                  placeholder="Optional"
                />
              </label>

              <label className="field">
                <span>Outbound proxy</span>
                <input
                  value={config.outboundProxy}
                  onChange={(event) => setConfig((current) => ({ ...current, outboundProxy: event.target.value }))}
                  placeholder="sip:pbx.example.com"
                />
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>STUN server</span>
                <input
                  value={config.stunServer}
                  onChange={(event) => setConfig((current) => ({ ...current, stunServer: event.target.value }))}
                  placeholder="stun:stun.l.google.com:19302"
                />
              </label>

              <label className="field">
                <span>TURN server</span>
                <input
                  value={config.turnServer}
                  onChange={(event) => setConfig((current) => ({ ...current, turnServer: event.target.value }))}
                  placeholder="turn:turn.example.com:3478?transport=udp"
                />
              </label>
            </div>

            <div className="field-grid">
              <label className="field">
                <span>TURN username</span>
                <input
                  value={config.turnUsername}
                  onChange={(event) => setConfig((current) => ({ ...current, turnUsername: event.target.value }))}
                  placeholder="Optional"
                />
              </label>

              <label className="field">
                <span>TURN password</span>
                <input
                  type="password"
                  value={config.turnPassword}
                  onChange={(event) => setConfig((current) => ({ ...current, turnPassword: event.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={config.autoConnect}
                onChange={(event) => setConfig((current) => ({ ...current, autoConnect: event.target.checked }))}
              />
              <span>Reconnect automatically after Chrome restarts if host access is already granted.</span>
            </label>

            {validationErrors.length > 0 ? (
              <div className="validation-box">
                {validationErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            ) : (
              <p className="hint-text">
                This starter stores SIP credentials in `chrome.storage.local`. Replace that with a stronger secret
                strategy before production rollout.
              </p>
            )}

            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                disabled={busyAction !== null}
                onClick={() => void saveConfig()}
              >
                {busyAction === "save" ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busyAction !== null}
                onClick={() => void handleSaveAndConnect()}
              >
                {busyAction === "save-connect" ? "Saving..." : "Save & Connect"}
              </button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function getConnectionLabel(state: SoftphoneState): string {
  if (state.call?.direction === "incoming" && state.call.status === "ringing") {
    return "Incoming";
  }

  if (state.call?.status === "active" || state.call?.status === "held") {
    return "In Call";
  }

  switch (state.registrationState) {
    case "registered":
      return "Registered";
    case "connecting":
      return "Connecting";
    case "failed":
      return "Failed";
    case "unregistered":
      return "Offline";
    default:
      return "Idle";
  }
}

function formatCallDuration(startedAt: string | null | undefined, currentTime: number): string | null {
  if (!startedAt) {
    return null;
  }

  const startedAtMs = new Date(startedAt).getTime();

  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.floor((currentTime - startedAtMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

interface TonePadProps {
  disabled: boolean;
  onPress: (tone: string) => void;
}

function TonePad({ disabled, onPress }: TonePadProps) {
  return (
    <div className="dialpad-grid">
      {TONE_PAD_KEYS.map((key) => (
        <button
          key={key.tone}
          type="button"
          className="dialpad-button"
          disabled={disabled}
          aria-label={key.letters ? `${key.tone} ${key.letters}` : key.tone}
          onClick={() => onPress(key.tone)}
        >
          <span className="dialpad-tone">{key.tone}</span>
          <span className="dialpad-letters">{key.letters || " "}</span>
        </button>
      ))}
    </div>
  );
}
