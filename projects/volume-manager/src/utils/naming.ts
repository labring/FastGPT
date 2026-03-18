// sessionId must be a 24-character hex string (MongoDB ObjectId)
const SESSION_ID_RE = /^[0-9a-f]{24}$/i;

export function toVolumeName(prefix: string, sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error(`Invalid sessionId: must be a 24-character hex string, got "${sessionId}"`);
  }
  return `${prefix}-${sessionId}`;
}
