// Shared between the FastGPT app (sign side) and sandbox-proxy (verify side).
// Keep this file dep-free so both standalone services can import without dragging extras.
export const SANDBOX_PROXY_AUTH_REFRESH_PATH = '/__fastgpt_proxy_auth';
export const SANDBOX_PROXY_CODE_SERVER_PATH = '/__fastgpt_proxy/code-server/';

export const SandboxProxyServiceList = ['code-server'] as const;
export type SandboxProxyService = (typeof SandboxProxyServiceList)[number];

export type ProxyTokenPayload = {
  /** Stable FastGPT sandbox id; bound to the iframe's subdomain on every request. */
  sid: string;
  /** Logical service requested through sandbox-proxy. */
  svc: SandboxProxyService;
  /**
   * Provider target generation. Edit-debug sandboxes may reuse the same FastGPT
   * sandbox id while recreating the provider resource; this value separates
   * sandbox-proxy caches across those generations.
   */
  rev?: string;
};
