# PulseDock Call Center Extension

Chrome side panel extension scaffold for a browser-based call center softphone using React, TypeScript and JsSIP.

## What is included

- React side panel UI for:
  - SIP configuration
  - connect and disconnect
  - outbound calling
  - dial pad entry
  - incoming call answer and reject
  - hold and resume
  - mute and unmute
  - in-call DTMF keypad
  - blind transfer
- Manifest V3 background service worker
- Offscreen document that owns JsSIP, WebRTC and remote audio playback
- Runtime messaging and state broadcasting between background, offscreen and side panel

## Project layout

- `public/manifest.json`: Chrome extension manifest
- `src/background/index.ts`: service worker, host permission gate and side panel bootstrapping
- `src/offscreen/CallManager.ts`: JsSIP registration and session control
- `src/offscreen/index.ts`: offscreen runtime entry
- `src/sidepanel/App.tsx`: main operator UI
- `src/sidepanel/SipProvider.tsx`: React context wrapper around the extension SIP runtime
- `src/shared/*`: shared types, storage and runtime helpers

## Local setup

1. `cd chrome-call-center-extension`
2. `npm install`
3. `npm run build`
4. Open `chrome://extensions`
5. Enable Developer mode
6. Choose Load unpacked
7. Select `chrome-call-center-extension/dist`

For continuous rebuilds during development:

1. `cd chrome-call-center-extension`
2. `npm run dev`
3. Reload the unpacked extension after each change set

## SIP configuration fields

- `Extension / username`: SIP auth username or PBX extension
- `Password`: SIP password
- `Domain`: SIP domain used to build `sip:user@domain`
- `WebSocket URL`: PBX websocket endpoint such as `wss://pbx.example.com:8089/ws`
- `Realm`: optional SIP auth realm
- `Outbound proxy`: optional registrar or outbound SIP URI
- `STUN/TURN`: optional ICE servers for NAT traversal

## Important notes

- This scaffold assumes the PBX supports browser softphones over `SIP + WebRTC + WSS`.
- `chrome.permissions.request()` is used to ask host access for the configured websocket origin on connect.
- Credentials are currently stored in `chrome.storage.local` for MVP speed. Replace this before production if your security requirements are stricter.
- The transfer flow is currently blind transfer via SIP REFER.
- The project is structured so queue state, CRM screen-pop, device selection, recording indicators and attended transfer can be added next without changing the core runtime split.

## Suggested next work

1. Replace local credential storage with encrypted or ephemeral secrets.
2. Add attended transfer and audio device selectors.
3. Add PBX-specific API integration for queues, agent states and wallboard metrics.
4. Add tests around message contracts and call state transitions.
