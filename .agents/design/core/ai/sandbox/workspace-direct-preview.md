# Agent Sandbox Workspace Direct Preview

## 1. Goal

Replace sandbox file S3 export with a short-lived, read-only URL:

```text
https://agent-proxy.fastgpt.cn/preview/{sandboxId}/{sessionId}/test/preview.html
```

The `sandboxId` and opaque `sessionId` identify a short-lived preview session stored by FastGPT in Redis.
The remaining URL is resolved as a workspace-relative path. File bytes flow from the sandbox IDE agent
through `agent-sandbox-proxy`; FastGPT stores and validates the business context and resolves the provider
endpoint without putting a JWT, provider endpoint, or IDE agent password in the public URL.

## 2. Scope

- Replace HTML S3 preview with direct workspace preview.
- Replace `sandbox_get_file_url` S3 uploads with direct workspace URLs.
- Support `GET`, `HEAD`, content type, content length, ETag, and single byte ranges.
- Preserve relative HTML references such as `./assets/app.js` and `../images/a.png`.
- Keep existing `fs` and `terminal` WebSocket behavior unchanged.
- Support provider endpoint resolution through `ISandbox.getEndpoint`.

The existing S3 workspace archive lifecycle is unrelated and remains unchanged.

## 3. Architecture

```text
FastGPT API / sandbox tool
  -> validates business access and the requested workspace path
  -> stores sandbox:preview:{sandboxId}:{sessionId} in Redis with a two-hour TTL
  -> returns /preview/{sandboxId}/{sessionId}/{workspacePath}

Browser / model
  -> GET /preview/{sandboxId}/{sessionId}/{workspacePath}
  -> agent-sandbox-proxy
       1. validates the sandboxId and sessionId formats
       2. sends sandboxId:sessionId to FastGPT in X-Sandbox-Preview-Session on cache misses
       3. caches the resolved sandbox address briefly
       4. proxies an authenticated HTTP request to port 1319
  -> FastGPT verifyTicket
       1. authenticates the proxy backchannel
       2. resolves the Redis session to its business context
       3. resolves the sandbox endpoint and IDE agent password
  -> fastgpt-ide-agent preview listener
       1. validates the internal agent password
       2. confines the path to FASTGPT_WORKDIR
       3. streams the file response
```

## 4. Session Contract

Preview links use a server-side session instead of a signed JWT in the URL.

```ts
key = `sandbox:preview:${sandboxId}:${sessionId}`;

value = {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId?: string;
  chatId?: string;
};
```

- `sandboxId` is exactly 16 lowercase hexadecimal characters.
- `sessionId` is a 24-character random alphanumeric identifier beginning with a lowercase letter.
- Each Redis key has an independent two-hour TTL.
- A sandbox may have at most 500 active preview sessions. Creation is rejected at the limit; existing
  sessions are not evicted.
- The session value contains only the runtime lookup context. It never contains provider endpoints or the
  IDE agent password.
- FastGPT treats the `sandboxId:sessionId` pair as the preview credential and rejects missing, malformed,
  expired, or mismatched sessions.

## 5. HTTP Contracts

### 5.1 Public proxy

```text
GET|HEAD /preview/{sandboxId}/{sessionId}/{*path}
```

- Preview may use an independent `PREVIEW_PORT`; when omitted it shares `PORT` with WebSocket routes.
- `sandboxId` and `sessionId` must match the formats in the session contract.
- `path` is workspace-relative.
- Other methods return `405`.
- The proxy combines the two identifiers as `sandboxId:sessionId` only for the FastGPT backchannel.
- The upstream host and port always come from FastGPT session resolution.

### 5.2 Sandbox preview listener

```text
GET|HEAD /preview/{*path}
X-FastGPT-Agent-Token: {agentPassword}
```

- Binds to the fixed internal address `0.0.0.0:1319`.
- Uses `FASTGPT_WORKDIR` as the root.
- Does not expose directory listings.
- Rejects absolute paths, traversal, invalid encodings, and symlinks escaping the workspace.

## 6. FastGPT Changes

- Add Redis-backed preview session creation, resolution, limits, and URL construction in the sandbox
  application layer.
- Require `AGENT_SANDBOX_PREVIEW_PROXY_URL` as the public HTTP preview origin. It remains separate
  from the required WebSocket `AGENT_SANDBOX_PROXY_URL` even when both URLs use the same port.
- Change `getHtmlPreviewLink` to validate the business session, create a preview session, and return a URL
  without reading or uploading the HTML file.
- Change `sandbox_get_file_url` to create preview sessions and return URLs without reading or uploading the
  files.
- Extend the internal verification API to accept `X-Sandbox-Preview-Session`, load the Redis session, and
  resolve endpoint port `1319`. Existing WebSocket JWT verification remains unchanged.
- Update OpenAPI descriptions and tool descriptions to remove S3 semantics.

## 7. Resource Reference Behavior

Given:

```text
/preview/{sandboxId}/{sessionId}/test/preview.html
```

- `./assets/app.js` resolves to `/preview/{sandboxId}/{sessionId}/test/assets/app.js` and works.
- `../images/a.png` resolves to `/preview/{sandboxId}/{sessionId}/images/a.png` and works.
- `/assets/app.js` loses the preview prefix and is intentionally unsupported in this path-based version.

The sandbox system prompt must require relative asset paths for generated previews.

## 8. Security

- A preview URL is a bearer capability for read-only access to the session's whole workspace. The
  `sandboxId` is not sufficient by itself; the random `sessionId` is also required.
- Preview content uses the existing proxy origin, which must remain separate from the FastGPT app origin.
- Preview sessions intentionally share the proxy origin. Cross-session browser storage isolation is not
  provided; the current product assumption is that unrelated users do not open previews in the same
  browser profile.
- Responses set `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and
  `Cache-Control: private, no-store`.
- Proxy and ingress logs must redact the `sandboxId` and `sessionId` path segments.
- The proxy sends the combined credential to FastGPT in `X-Sandbox-Preview-Session`, not the query string,
  so the main app's request logs do not contain the preview credential.
- The proxy does not accept an upstream URL, host, scheme, or port from the client.
- Cached endpoint resolution uses a SHA-256 key derived from `sandboxId:sessionId` and does not retain the
  plaintext credential as the cache key.
- FastGPT checks Redis session validity on proxy cache misses. An already cached address may remain usable
  until `AGENT_SANDBOX_PROXY_ADDRESS_CACHE_TTL_SECS` elapses, 30 seconds by default, after the Redis session
  expires or is deleted.

## 9. Compatibility And Rollout

- Sandbox runtime images must include the preview listener before FastGPT starts issuing preview URLs.
- Default deployments expose one proxy port; split WebSocket and Preview ports only when explicitly configured.
- Old sandboxes without port 1319 return a clear proxy error; local integration uses a freshly built image.
- FastGPT, `agent-sandbox-proxy`, and the sandbox runtime image must be deployed as one coordinated release.
  Mixed-version rolling deployment is outside the supported rollout contract.
- Preview JWT URLs from the earlier implementation are not compatible with the session route and stop working
  after the coordinated release. Existing `fs` and `terminal` WebSocket tickets remain compatible.
- `fs`, `terminal`, editor upload/download, and workspace S3 archive paths remain unchanged.
- Local verification builds worktree images and runs them against the existing Docker dependencies.

## 10. TODO

- [x] Implement and test the IDE agent preview HTTP listener.
- [x] Implement and test proxy preview routing and streaming relay.
- [x] Add Redis-backed preview session creation, resolution, limits, and URL helpers.
- [x] Replace HTML preview S3 upload.
- [x] Replace `sandbox_get_file_url` S3 upload.
- [x] Update OpenAPI, environment/runtime contracts, prompt, and rollout notes.
- [x] Build local sandbox and proxy images.
- [x] Run TypeScript and Rust unit tests.
- [x] Run an OpenSandbox end-to-end test with HTML, CSS, image, HEAD, Range, expiry, auth, and missing files.
- [x] Cover traversal and escaping symlinks in unit tests.
- [x] Run repository-wide final validation.
