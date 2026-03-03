# @fastgpt/sandbox

A unified, high-level abstraction layer for cloud sandbox providers. It offers a consistent, vendor-agnostic interface for creating, managing, and interacting with sandboxed environments like OpenSandbox.

> This package is ESM-only (`"type": "module"`) and requires Node.js **>= 20**.

## Installation

```bash
pnpm add @fastgpt/sandbox
```

## Quick Start

The following example demonstrates the complete lifecycle of a sandbox: creating, executing commands, managing files, and finally, deleting it.

```ts
import { createSandbox } from '@fastgpt/sandbox';

async function main() {
  // 1. Create a sandbox with the OpenSandbox provider
  const sandbox = createSandbox({
    provider: 'opensandbox',
    connection: {
      apiKey: process.env.OPEN_SANDBOX_API_KEY,
      baseUrl: 'http://127.0.0.1:8080', // Your OpenSandbox server
      runtime: 'kubernetes',
    },
  });

  console.log(`Provider: ${sandbox.provider}`);
  console.log(`Native filesystem support: ${sandbox.capabilities.nativeFileSystem}`);

  try {
    // 2. Create the sandbox instance with a specific image
    await sandbox.create({
      image: { repository: 'nginx', tag: 'latest' },
      timeout: 3600, // Expiration in seconds
    });
    console.log(`Sandbox created: ${sandbox.id}`);

    // 3. Wait until the sandbox is fully ready
    await sandbox.waitUntilReady(60000); // 60-second timeout
    console.log('Sandbox is ready.');

    // 4. Execute a simple command
    const version = await sandbox.execute('nginx -v');
    console.log(`Nginx version: ${version.stdout || version.stderr}`);

    // 5. Execute a command with streaming output
    console.log('--- Streaming Execution ---');
    await sandbox.executeStream('for i in 1 2 3; do echo "Line $i"; sleep 0.5; done', {
      onStdout: (msg) => console.log(`  [stdout] ${msg.text}`),
      onStderr: (msg) => console.log(`  [stderr] ${msg.text}`),
      onComplete: (result) => console.log(`  [done] Exit code: ${result.exitCode}`),
    });

    // 6. Work with the filesystem
    console.log('\n--- Filesystem Operations ---');
    // Write a file
    await sandbox.writeFiles([
      {
        path: '/app/hello.js',
        data: `console.log('Hello from sandbox!');`,
      },
    ]);
    console.log('Written /app/hello.js');

    // Read the file back
    const [file] = await sandbox.readFiles(['/app/hello.js']);
    if (file && !file.error) {
        const content = new TextDecoder().decode(file.content);
        console.log(`Read content: "${content}"`);
    }

    // List directory
    const entries = await sandbox.listDirectory('/app');
    console.log('Directory listing for /app:', entries.map(e => e.name));


    // 7. Stop and delete the sandbox
    console.log('\n--- Cleanup ---');
    await sandbox.stop();
    console.log('Sandbox stopped.');
    
    if (sandbox.runtime !== 'kubernetes') {
      await sandbox.delete();
      console.log('Sandbox deleted.');
    }

  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    // 8. Close the connection
    await sandbox.close();
    console.log('Connection closed.');
  }
}

main();
```

## API (`ISandbox`)

The `createSandbox(options)` function returns an instance that implements the `ISandbox` interface.

### Lifecycle Management

- **`create(options)`**: Creates a new sandbox instance.
- **`getInfo()`**: Retrieves detailed information about the sandbox.
- **`waitUntilReady(timeout)`**: Waits for the sandbox to become fully operational.
- **`renewExpiration(seconds)`**: Extends the sandbox's lifetime.
- **`pause()` / `resume()`**: Pauses and resumes a running sandbox (if supported).
- **`stop()`**: Stops the sandbox gracefully.
- **`delete()`**: Deletes the sandbox instance.
- **`close()`**: Closes the connection to the provider.

### Command Execution

- **`execute(command)`**: Executes a command and returns the result after completion.
- **`executeStream(command, handlers)`**: Executes a command and streams `stdout` and `stderr` in real-time.
- **`executeBackground(command)`**: Starts a command in the background and returns a session handle.

### Filesystem Operations

- **`writeFiles(files)`**: Writes one or more files to the sandbox.
- **`readFiles(paths)`**: Reads one or more files from the sandbox.
- **`listDirectory(path)`**: Lists the contents of a directory.
- **`createDirectories(paths)`**: Creates directories.
- **`deleteFiles(paths)`**: Deletes files.
- **`moveFiles(files)`**: Moves or renames files.

### Health and Metrics

- **`ping()`**: Performs a quick health check.
- **`getMetrics()`**: Retrieves CPU and memory usage statistics.

## Provider Capabilities

Different sandbox providers have different native capabilities. The SDK uses polyfills to provide a consistent API, but performance may vary.

| Feature | OpenSandbox | MinimalProvider |
|---------|-------------|-----------------|
| Native Filesystem | ✅ | ❌ (polyfilled) |
| Streaming Output | ✅ | ❌ (fallback) |
| Background Exec | ✅ | ⚠️ (simulated) |
| Pause/Resume | ✅ | ❌ |
| Health Check | ✅ | ⚠️ (polyfilled) |
| Metrics | ✅ | ⚠️ (polyfilled) |
| File Search | ✅ | ⚠️ (polyfilled) |

## Error Handling

The SDK exports specific error types to facilitate robust error handling:

- `SandboxException`
- `FeatureNotSupportedError`
- `FileOperationError`
- `CommandExecutionError`
- `TimeoutError`

Example:
```ts
import { FileOperationError } from '@fastgpt/sandbox';

try {
  await sandbox.readFiles(['/nonexistent-file']);
} catch (error) {
  if (error instanceof FileOperationError) {
    console.error(`File operation failed: ${error.message}`);
  }
}
```
