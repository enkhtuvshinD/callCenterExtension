declare module "jssip" {
  export interface WebSocketInterface {}

  export interface RTCSession {
    id?: string;
    connection?: RTCPeerConnection;
    remote_identity?: {
      display_name?: string;
      uri?: {
        user?: string;
        host?: string;
        toString(): string;
      };
    };
    answer(options?: Record<string, unknown>): void;
    terminate(options?: Record<string, unknown>): void;
    sendDTMF(tones: string, options?: Record<string, unknown>): void;
    hold(options?: Record<string, unknown>): void;
    unhold(options?: Record<string, unknown>): void;
    mute(options?: Record<string, unknown>): void;
    unmute(options?: Record<string, unknown>): void;
    refer(target: string, options?: Record<string, unknown>): void;
    isOnHold(): {
      local: boolean;
      remote: boolean;
    };
    isMuted(): {
      audio: boolean;
      video: boolean;
    };
    on(event: string, handler: (payload: any) => void): void;
  }

  export interface UA {
    start(): void;
    stop(): void;
    call(target: string, options?: Record<string, unknown>): RTCSession;
    on(event: string, handler: (payload: any) => void): void;
  }

  const JsSIP: {
    WebSocketInterface: new (url: string) => WebSocketInterface;
    UA: new (configuration: Record<string, unknown>) => UA;
  };

  export default JsSIP;
}
