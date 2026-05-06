// Shared between the FastGPT app (sign side) and sandbox-proxy (verify side).
// Keep this file dep-free so both standalone services can import without dragging extras.
export const SANDBOX_PROXY_AUTH_REFRESH_PATH = '/__fastgpt_proxy_auth';

export type ProxyTokenPayload = {
  /** Sandbox provider id; bound to the iframe's subdomain on every request. */
  sid: string;
  /** Inner port metadata. Currently informational; reserved for multi-port support. */
  p: number;
  /** Direct upstream base URL (host:port form), bypassing opensandbox path-proxy. */
  t: string;
};
