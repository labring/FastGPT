# @fastgpt-sdk/sandbox-adapter

FastGPT's ESM-only sandbox provider abstraction for OpenSandbox and Sealos Devbox. Node.js 20 or
newer is required.

## Install

```bash
pnpm add @fastgpt-sdk/sandbox-adapter
```

## Usage

```ts
import { createSandbox } from '@fastgpt-sdk/sandbox-adapter';

const sandbox = createSandbox({
  provider: 'opensandbox',
  connectionConfig: {
    sessionId: 'session-1',
    baseUrl: 'https://opensandbox.example.com',
    apiKey: process.env.OPENSANDBOX_API_KEY
  },
  createConfig: {
    image: { repository: 'node', tag: '20' }
  }
});

await sandbox.ensureRunning();
const result = await sandbox.execute('node --version');
await sandbox.close();
```

`stop()` follows provider policy: OpenSandbox deletes the remote sandbox while preserving external
workspace storage, whereas Sealos pauses the Devbox. `delete()` permanently removes the provider
resource; application-level deletion may additionally clean storage and archives. `close()` only
releases local transports.

Batch `readFiles()` and `writeFiles()` remain available for small files. Use `readFileStream()` and
`writeFileStream()` for large files. Byte ranges use `{ offset, length }`, and permission modes use
POSIX bitmasks such as `0o644`.

Check `sandbox.capabilities` before using optional operations such as real-time command streaming,
background commands, metrics, or expiration renewal. Unsupported operations reject with
`FeatureNotSupportedError`.

## Next.js

Add the package to `transpilePackages` when the application build does not transpile workspace ESM
dependencies automatically:

```js
const nextConfig = {
  transpilePackages: ['@fastgpt-sdk/sandbox-adapter']
};

export default nextConfig;
```
