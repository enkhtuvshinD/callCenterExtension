export function websocketUrlToPermissionOrigin(websocketUrl: string): string | null {
  if (!websocketUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(websocketUrl);
    const protocol =
      parsedUrl.protocol === "wss:"
        ? "https:"
        : parsedUrl.protocol === "ws:"
          ? "http:"
          : parsedUrl.protocol;

    return `${protocol}//${parsedUrl.host}/*`;
  } catch (error) {
    void error;
    return null;
  }
}
