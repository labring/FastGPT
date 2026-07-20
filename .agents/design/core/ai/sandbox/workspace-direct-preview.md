# Agent Sandbox Workspace Direct Preview

## 1. Goal

Replace sandbox file S3 export with a short-lived, read-only URL:

```text
https://agent-proxy.fastgpt.cn/preview/{token}/test/preview.html
```

The token authenticates one sandbox workspace. The remaining URL is resolved as a workspace-relative
path. File bytes flow from the sandbox IDE agent through `agent-sandbox-proxy`; FastGPT only authenticates
the business session, signs the token, and resolves the provider endpoint.

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
Browser / model
  -> GET /preview/{token}/{workspacePath}
  -> agent-sandbox-proxy
       1. verifies HMAC token locally
       2. resolves the sandbox endpoint through FastGPT verifyTicket using an internal header
       3. proxies an authenticated HTTP request to port 1319
  -> fastgpt-ide-agent preview listener
       1. validates the internal agent password
       2. confines the path to FASTGPT_WORKDIR
       3. streams the file response
```

## 4. Token Contract

Preview tokens reuse `AGENT_SANDBOX_PROXY_SECRET` and the existing business identity claims:

```ts
{
  sourceType,
  sourceId,
  userId,
  chatId,
  channel: 'preview',
  permission: 'read',
  exp
}
```

The token never contains provider endpoints or the IDE agent password. The default lifetime remains two
hours to preserve the existing `sandbox_get_file_url` contract.

## 5. HTTP Contracts

### 5.1 Public proxy

```text
GET|HEAD /preview/{token}/{*path}
```

- `token` is one base64url JWT path segment.
- `path` is workspace-relative.
- Other methods return `405`.
- The upstream host and port always come from FastGPT ticket resolution.

### 5.2 Sandbox preview listener

```text
GET|HEAD /preview/{*path}
X-FastGPT-Agent-Token: {agentPassword}
```

- Binds to `IDE_AGENT_PREVIEW_BIND_ADDR`, default `0.0.0.0:1319`.
- Uses `FASTGPT_WORKDIR` as the root.
- Does not expose directory listings.
- Rejects absolute paths, traversal, invalid encodings, and symlinks escaping the workspace.

## 6. FastGPT Changes

- Add reusable preview token signing and URL construction in the sandbox application layer.
- Derive the public HTTP proxy URL from `AGENT_SANDBOX_PROXY_URL` (`ws -> http`, `wss -> https`).
- Change `getHtmlPreviewLink` to validate the session and return a preview URL without reading/uploading
  the HTML file.
- Change `sandbox_get_file_url` to return preview URLs without reading/uploading the files.
- Extend internal ticket verification with `channel=preview` and endpoint port `1319`.
- Update OpenAPI descriptions and tool descriptions to remove S3 semantics.

## 7. Resource Reference Behavior

Given:

```text
/preview/{token}/test/preview.html
```

- `./assets/app.js` resolves to `/preview/{token}/test/assets/app.js` and works.
- `../images/a.png` resolves to `/preview/{token}/images/a.png` and works.
- `/assets/app.js` loses the token prefix and is intentionally unsupported in this path-based version.

The sandbox system prompt must require relative asset paths for generated previews.

## 8. Security

- A preview URL is a bearer capability for read-only access to the token's whole workspace.
- Preview content uses the existing proxy origin, which must remain separate from the FastGPT app origin.
- Responses set `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and
  `Cache-Control: private, no-store`.
- Proxy and ingress logs must redact the token path segment.
- The proxy sends tickets to FastGPT in `X-Sandbox-Ticket`, not the query string, so the main app's
  request logs do not contain bearer tokens. FastGPT temporarily accepts the old query transport for rollout.
- The proxy does not accept an upstream URL, host, scheme, or port from the client.
- Cached endpoint resolution uses SHA-256 token keys and never bypasses local token expiration checks.

## 9. Compatibility And Rollout

- Sandbox runtime images must include the preview listener before FastGPT starts issuing preview URLs.
- Old sandboxes without port 1319 return a clear proxy error; local integration uses a freshly built image.
- Upgrade FastGPT before agent-sandbox-proxy: the app accepts both old query tickets and new header tickets,
  while the new proxy only uses the non-logging header transport.
- `fs`, `terminal`, editor upload/download, and workspace S3 archive paths remain unchanged.
- Local verification builds worktree images and runs them against the existing Docker dependencies.

## 10. TODO

- [x] Implement and test the IDE agent preview HTTP listener.
- [x] Implement and test proxy preview routing and streaming relay.
- [x] Add preview token signing, ticket verification, and URL helpers.
- [x] Replace HTML preview S3 upload.
- [x] Replace `sandbox_get_file_url` S3 upload.
- [x] Update OpenAPI, environment/runtime contracts, prompt, and rollout notes.
- [x] Build local sandbox and proxy images.
- [x] Run TypeScript and Rust unit tests.
- [x] Run an OpenSandbox end-to-end test with HTML, CSS, image, HEAD, Range, expiry, auth, and missing files.
- [x] Cover traversal and escaping symlinks in unit tests.
- [x] Run repository-wide final validation.
