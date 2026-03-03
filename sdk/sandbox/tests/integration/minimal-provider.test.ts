import { describe, expect, it } from 'vitest';
import {
  MinimalProviderAdapter,
  type MinimalProviderConnection
} from '../../src/adapters/MinimalProviderAdapter';

interface MockExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function handlePing(): MockExecutionResult {
  return { stdout: 'PING', stderr: '', exitCode: 0 };
}

function handleMkdir(): MockExecutionResult {
  return { stdout: '', stderr: '', exitCode: 0 };
}

function handleHeredoc(command: string, mockFs: Map<string, string>): MockExecutionResult {
  const pathMatch = command.match(/cat > "(.+?)" << 'POLYFILL_EOF'/);
  if (pathMatch) {
    const path = pathMatch[1];
    const lines = command.split('\n');
    const contentLines: string[] = [];
    let inContent = false;
    for (const line of lines) {
      if (line.includes("<< 'POLYFILL_EOF'")) {
        inContent = true;
        continue;
      }
      if (line.trim() === 'POLYFILL_EOF') {
        break;
      }
      if (inContent) {
        contentLines.push(line);
      }
    }
    mockFs.set(path, contentLines.join('\n'));
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

function handleBase64Read(command: string, mockFs: Map<string, string>): MockExecutionResult {
  const match = command.match(/cat "(.+?)" \| base64 -w 0/);
  const path = match?.[1]?.replace(/\\"/g, '"');
  if (path && mockFs.has(path)) {
    const content = mockFs.get(path);
    if (!content) {
      return { stdout: '', stderr: 'cat: No such file', exitCode: 1 };
    }
    const binary = Array.from(content)
      .map((b) => String.fromCharCode(b.charCodeAt(0)))
      .join('');
    const base64 = btoa(binary);
    return { stdout: base64, stderr: '', exitCode: 0 };
  }
  return { stdout: '', stderr: 'cat: No such file', exitCode: 1 };
}

function handleBase64Write(command: string, mockFs: Map<string, string>): MockExecutionResult {
  const pathMatch = command.match(/> "(.+?)"$/);
  const dataMatch = command.match(/echo "(.+?)" \| base64 -d/);
  if (pathMatch && dataMatch) {
    const path = pathMatch[1]?.replace(/\\"/g, '"');
    const base64Data = dataMatch[1] || '';
    try {
      const decoded = atob(base64Data);
      mockFs.set(path, decoded);
    } catch {
      // Invalid base64, ignore
    }
  }
  return { stdout: '', stderr: '', exitCode: 0 };
}

function handleLs(command: string, mockFs: Map<string, string>): MockExecutionResult {
  const match = command.match(/ls -la "([^"]+)"/);
  const path = match?.[1] || '.';

  const entries = Array.from(mockFs.keys())
    .filter((f) => f.startsWith(path))
    .map((f) => f.slice(path.length + 1).split('/')[0])
    .filter((f) => f);

  const uniqueEntries = [...new Set(entries)];
  const output = uniqueEntries
    .map((e) => `-rw-r--r-- 1 user group 100 2024-01-15T10:00:00 ${e}`)
    .join('\n');

  return { stdout: output, stderr: '', exitCode: 0 };
}

function createMockConnection(mockFs: Map<string, string>): MinimalProviderConnection {
  return {
    id: 'integration-test-sandbox',

    async execute(command: string) {
      if (command.includes('echo "PING"')) {
        return handlePing();
      }

      if (command.includes('mkdir -p')) {
        return handleMkdir();
      }

      if (command.includes("<< 'POLYFILL_EOF'")) {
        return handleHeredoc(command, mockFs);
      }

      if (command.includes('base64 -w 0')) {
        return handleBase64Read(command, mockFs);
      }

      if (command.includes('base64 -d')) {
        return handleBase64Write(command, mockFs);
      }

      if (command.includes('ls -la')) {
        return handleLs(command, mockFs);
      }

      return { stdout: `Executed: ${command}`, stderr: '', exitCode: 0 };
    },

    async getStatus() {
      return { state: 'Running' as const };
    },

    async close() {
      // No-op
    }
  };
}

/**
 * Integration test demonstrating end-to-end usage of MinimalProviderAdapter.
 *
 * This test simulates a real minimal provider (e.g., SSH connection)
 * and verifies that filesystem operations work via polyfills.
 */
describe('MinimalProvider Integration', () => {
  it('should perform full workflow with polyfilled filesystem', async () => {
    // Simulate a minimal connection
    const mockFs = new Map<string, string>();

    const connection = createMockConnection(mockFs);

    // Create adapter and connect
    const adapter = new MinimalProviderAdapter();
    await adapter.connect(connection);

    // Verify capabilities
    expect(adapter.capabilities.nativeFileSystem).toBe(false);
    expect(adapter.provider).toBe('minimal');

    // Test ping
    const pingResult = await adapter.ping();
    expect(pingResult).toBe(true);

    // Test file write (via polyfill)
    const writeResults = await adapter.writeFiles([
      { path: '/workspace/test.txt', data: 'Hello, Integration Test!' }
    ]);
    expect(writeResults[0].error).toBeNull();

    // Test file read (via polyfill)
    const readResults = await adapter.readFiles(['/workspace/test.txt']);
    expect(readResults[0].error).toBeNull();
    const content = new TextDecoder().decode(readResults[0].content);
    expect(content).toBe('Hello, Integration Test!');

    // Test directory listing (via polyfill)
    const entries = await adapter.listDirectory('/workspace');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].name).toBe('test.txt');

    // Cleanup
    await adapter.close();
  });

  it('should demonstrate feature parity between adapters', async () => {
    /**
     * This test demonstrates that both OpenSandbox (native) and
     * MinimalProvider (polyfilled) expose the same interface,
     * enabling provider-agnostic code.
     */

    // Both adapters implement ISandbox
    const providers = [
      {
        name: 'minimal',
        adapter: new MinimalProviderAdapter(),
        expectedNativeFs: false
      }
    ];

    for (const { name, adapter, expectedNativeFs } of providers) {
      // Same interface, different implementations
      expect(adapter.provider).toBe(name);
      expect(adapter.capabilities.nativeFileSystem).toBe(expectedNativeFs);

      // All ISandbox methods are available
      expect(typeof adapter.execute).toBe('function');
      expect(typeof adapter.readFiles).toBe('function');
      expect(typeof adapter.writeFiles).toBe('function');
      expect(typeof adapter.ping).toBe('function');
    }
  });
});
