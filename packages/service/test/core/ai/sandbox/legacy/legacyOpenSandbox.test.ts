import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '../../../../../env';

const sdkMocks = vi.hoisted(() => ({
  listSandboxInfos: vi.fn(),
  killSandbox: vi.fn(),
  getSandboxInfo: vi.fn(),
  managerClose: vi.fn(async () => undefined),
  sandboxCreate: vi.fn(),
  sandboxRenew: vi.fn(async () => ({ expiresAt: new Date() })),
  sandboxKill: vi.fn(async () => undefined),
  sandboxClose: vi.fn(async () => undefined),
  runStream: vi.fn(),
  createDirectories: vi.fn(async () => undefined),
  writeFiles: vi.fn(async () => undefined),
  setPermissions: vi.fn(async () => undefined),
  listDirectory: vi.fn(async () => []),
  readBytesStream: vi.fn(),
  unmountSessionVolume: vi.fn(async () => undefined),
  getInstanceId: vi.fn(async () => 'deploy-test-01')
}));

vi.mock('@alibaba-group/opensandbox', () => {
  class MockSandboxApiException extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  }
  class MockConnectionConfig {
    withTransportIfMissing() {
      return this;
    }
  }
  class MockExecutionEventDispatcher {
    private execution: { complete?: boolean; error?: { value?: string; exitCode?: number } };
    private opts: {
      onStdout?: (m: { text: string }) => void;
      onStderr?: (m: { text: string }) => void;
    };
    constructor(
      execution: { complete?: boolean; error?: { value?: string; exitCode?: number } },
      opts: { onStdout?: (m: { text: string }) => void; onStderr?: (m: { text: string }) => void }
    ) {
      this.execution = execution;
      this.opts = opts;
    }
    async dispatch(event: {
      type: string;
      text?: string;
      exitCode?: number;
      error?: { value?: string; exitCode?: number };
    }) {
      if (event.type === 'stdout' && event.text) this.opts.onStdout?.({ text: event.text });
      if (event.type === 'stderr' && event.text) this.opts.onStderr?.({ text: event.text });
      if (event.type === 'execution_complete') this.execution.complete = true;
      if (event.type === 'error') this.execution.error = event.error ?? { exitCode: 1 };
    }
  }

  return {
    ConnectionConfig: MockConnectionConfig,
    ExecutionEventDispatcher: MockExecutionEventDispatcher,
    SandboxApiException: MockSandboxApiException,
    SandboxManager: {
      create: () => ({
        listSandboxInfos: sdkMocks.listSandboxInfos,
        killSandbox: sdkMocks.killSandbox,
        getSandboxInfo: sdkMocks.getSandboxInfo,
        close: sdkMocks.managerClose
      })
    },
    Sandbox: {
      create: sdkMocks.sandboxCreate
    }
  };
});

vi.mock('../../../../../common/system/config/instanceId', () => ({
  getInstanceId: sdkMocks.getInstanceId
}));

vi.mock('../../../../../core/ai/sandbox/infrastructure/volume/service', () => ({
  unmountSessionVolume: sdkMocks.unmountSessionVolume
}));

import {
  LEGACY_WORKSPACE_MOUNT_PATH,
  terminateLegacyOpenSandboxContainers,
  withLegacyExportOpenSandbox,
  withTemporaryMigrationSandbox
} from '../../../../../core/ai/sandbox/legacy/legacyOpenSandbox';

describe('legacyOpenSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local:8080';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'ghcr.io/labring/fastgpt-sandbox:v0.4.0';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'docker';
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 1;
  });

  it('terminates only legacy containers without deploymentId and preserves v3 containers', async () => {
    sdkMocks.listSandboxInfos.mockResolvedValue({
      items: [
        {
          id: 'legacy-cnt-1',
          metadata: { sessionId: 'app-1' },
          status: { state: 'Running' }
        },
        {
          id: 'v3-cnt-keep',
          metadata: { sessionId: 'app-1', deploymentId: 'deploy-test-01' },
          status: { state: 'Running' }
        }
      ],
      pagination: { hasNextPage: false }
    });
    sdkMocks.killSandbox.mockResolvedValue(undefined);
    sdkMocks.getSandboxInfo.mockResolvedValue({
      id: 'legacy-cnt-1',
      status: { state: 'Deleted' }
    });

    const count = await terminateLegacyOpenSandboxContainers({ sandboxId: 'app-1' });
    expect(count).toBe(1);
    expect(sdkMocks.killSandbox).toHaveBeenCalledTimes(1);
    expect(sdkMocks.killSandbox).toHaveBeenCalledWith('legacy-cnt-1');
  });

  it('mounts rw JuiceFS volume and ro legacy volume, runs execd stream ops, and unmounts on Docker cleanup', async () => {
    sdkMocks.runStream.mockImplementation(async function* () {
      yield { type: 'stdout', text: 'copied-ok\n' };
      yield { type: 'execution_complete' };
    });
    sdkMocks.sandboxCreate.mockResolvedValue({
      id: 'tmp-mig-cnt',
      commands: { runStream: sdkMocks.runStream },
      files: {
        createDirectories: sdkMocks.createDirectories,
        writeFiles: sdkMocks.writeFiles,
        setPermissions: sdkMocks.setPermissions
      },
      kill: sdkMocks.sandboxKill,
      close: sdkMocks.sandboxClose
    });
    sdkMocks.getSandboxInfo.mockResolvedValue({
      id: 'tmp-mig-cnt',
      status: { state: 'Deleted' }
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.close();
      }
    });

    const output = await withTemporaryMigrationSandbox({
      sandboxId: 'app-1',
      newClaimName: 'fastgpt-session-app-1-new',
      legacyClaimName: 'fastgpt-session-app-1-old',
      fn: async ({ exec, createDirectories, uploadStream, setPermissions }) => {
        await createDirectories([{ path: '/workspace/src', mode: 755 }]);
        await uploadStream('/workspace/src/a.txt', stream, 644);
        await setPermissions([{ path: '/workspace/src', mode: 555 }]);
        return exec('echo ok');
      }
    });

    expect(output.stdout).toBe('copied-ok\n');
    expect(sdkMocks.createDirectories).toHaveBeenCalledWith([
      { path: '/workspace/src', mode: 755 }
    ]);
    expect(sdkMocks.writeFiles).toHaveBeenCalledWith([
      { path: '/workspace/src/a.txt', data: stream, mode: 644 }
    ]);
    expect(sdkMocks.setPermissions).toHaveBeenCalledWith([{ path: '/workspace/src', mode: 555 }]);
    expect(sdkMocks.sandboxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: ['sleep', 'infinity'],
        volumes: [
          expect.objectContaining({
            pvc: expect.objectContaining({ claimName: 'fastgpt-session-app-1-new' }),
            mountPath: '/workspace',
            readOnly: false
          }),
          expect.objectContaining({
            pvc: expect.objectContaining({ claimName: 'fastgpt-session-app-1-old' }),
            mountPath: LEGACY_WORKSPACE_MOUNT_PATH,
            readOnly: true
          })
        ]
      })
    );
    expect(sdkMocks.sandboxKill).toHaveBeenCalledTimes(1);
    expect(sdkMocks.unmountSessionVolume).toHaveBeenCalledWith('fastgpt-session-app-1-new');
  });

  it('derives kubernetes ephemeral-storage from AGENT_SANDBOX_STORAGE_SIZE_GI + 0.5 and supports 2x multiplier on temporary sandbox', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'kubernetes';
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 3;
    sdkMocks.sandboxCreate.mockResolvedValue({
      id: 'tmp-k8s-cnt',
      commands: { runStream: sdkMocks.runStream },
      files: {
        createDirectories: sdkMocks.createDirectories,
        writeFiles: sdkMocks.writeFiles,
        setPermissions: sdkMocks.setPermissions
      },
      kill: sdkMocks.sandboxKill,
      close: sdkMocks.sandboxClose
    });
    sdkMocks.getSandboxInfo.mockResolvedValue({
      id: 'tmp-k8s-cnt',
      status: { state: 'Deleted' }
    });

    await withTemporaryMigrationSandbox({
      sandboxId: 'app-k8s-1',
      newClaimName: 'fastgpt-session-app-k8s-1-new',
      fn: async () => undefined
    });
    await withTemporaryMigrationSandbox({
      sandboxId: 'app-k8s-devbox',
      newClaimName: 'fastgpt-session-app-k8s-devbox-new',
      ephemeralStorageWorkspaceMultiplier: 2,
      fn: async () => undefined
    });

    expect(sdkMocks.sandboxCreate.mock.calls[0]?.[0]?.resource).toEqual(
      expect.objectContaining({ 'ephemeral-storage': '3.5Gi' })
    );
    expect(sdkMocks.sandboxCreate.mock.calls[1]?.[0]?.resource).toEqual(
      expect.objectContaining({ 'ephemeral-storage': '6.5Gi' })
    );
  });

  it('launches read-only legacy export container on separate Docker endpoint without ephemeral-storage and exposes listDirectory/openFileStream', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'kubernetes';
    sdkMocks.runStream.mockImplementation(async function* () {
      yield { type: 'stdout', text: '6\n' };
      yield { type: 'execution_complete' };
    });
    sdkMocks.listDirectory.mockResolvedValue([
      { path: '/legacy-workspace/hello.txt', type: 'file', size: 6, mode: 644 }
    ]);
    sdkMocks.readBytesStream.mockImplementation(async function* () {
      yield new Uint8Array([104, 101, 108]);
      yield new Uint8Array([108, 111, 10]);
    });
    sdkMocks.sandboxCreate.mockResolvedValue({
      id: 'legacy-export-cnt',
      commands: { runStream: sdkMocks.runStream },
      files: {
        writeFiles: sdkMocks.writeFiles,
        listDirectory: sdkMocks.listDirectory,
        readBytesStream: sdkMocks.readBytesStream
      },
      kill: sdkMocks.sandboxKill,
      close: sdkMocks.sandboxClose
    });
    sdkMocks.getSandboxInfo.mockResolvedValue({
      id: 'legacy-export-cnt',
      status: { state: 'Deleted' }
    });

    const result = await withLegacyExportOpenSandbox({
      sandboxId: 'app-cross-1',
      legacyClaimName: 'fastgpt-session-app-cross-1-old',
      endpoint: {
        baseUrl: 'http://legacy-docker-opensandbox.local:8090',
        apiKey: 'legacy-key',
        image: 'ghcr.io/labring/fastgpt-sandbox:v0.3.0',
        runtime: 'docker'
      },
      fn: async ({ exec, listDirectory, openFileStream }) => {
        const listed = await listDirectory(LEGACY_WORKSPACE_MOUNT_PATH, 1);
        const packOut = await exec('echo 6');
        const reader = openFileStream('/legacy-workspace/hello.txt').getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        return {
          listedCount: listed.length,
          stdout: packOut.stdout,
          bytes: Buffer.concat(chunks).toString('utf8')
        };
      }
    });

    expect(result).toEqual({ listedCount: 1, stdout: '6\n', bytes: 'hello\n' });
    expect(sdkMocks.listDirectory).toHaveBeenCalledWith({
      path: LEGACY_WORKSPACE_MOUNT_PATH,
      depth: 1
    });
    const createCall = sdkMocks.sandboxCreate.mock.calls[0]?.[0];
    expect(createCall.resource).not.toHaveProperty('ephemeral-storage');
    expect(createCall.volumes).toEqual([
      expect.objectContaining({
        pvc: {
          claimName: 'fastgpt-session-app-cross-1-old',
          createIfNotExists: false,
          deleteOnSandboxTermination: false
        },
        mountPath: LEGACY_WORKSPACE_MOUNT_PATH,
        readOnly: true
      })
    ]);
    expect(sdkMocks.sandboxKill).toHaveBeenCalledTimes(1);
    expect(sdkMocks.unmountSessionVolume).not.toHaveBeenCalled();
  });

  it('uses 600s default command timeout and periodically renews both temporary and export sandboxes during long copies', async () => {
    vi.useFakeTimers();
    try {
      sdkMocks.runStream.mockImplementation(async function* () {
        yield { type: 'stdout', text: 'ok\n' };
        yield { type: 'execution_complete' };
      });
      sdkMocks.sandboxCreate.mockResolvedValue({
        id: 'tmp-renew-cnt',
        commands: { runStream: sdkMocks.runStream },
        files: {
          createDirectories: sdkMocks.createDirectories,
          writeFiles: sdkMocks.writeFiles,
          setPermissions: sdkMocks.setPermissions,
          listDirectory: sdkMocks.listDirectory,
          readBytesStream: sdkMocks.readBytesStream
        },
        renew: sdkMocks.sandboxRenew,
        kill: sdkMocks.sandboxKill,
        close: sdkMocks.sandboxClose
      });
      sdkMocks.getSandboxInfo.mockResolvedValue({
        id: 'tmp-renew-cnt',
        status: { state: 'Deleted' }
      });

      await withTemporaryMigrationSandbox({
        sandboxId: 'app-long-1',
        newClaimName: 'fastgpt-session-app-long-1',
        fn: async ({ exec }) => {
          await exec('tar cf - . | tar xf -');
          await vi.advanceTimersByTimeAsync(6 * 60_000 + 10_000);
        }
      });

      expect(sdkMocks.runStream).toHaveBeenCalledWith(
        'tar cf - . | tar xf -',
        expect.objectContaining({ timeoutSeconds: 600 }),
        expect.any(AbortSignal)
      );
      expect(sdkMocks.sandboxRenew).toHaveBeenCalledTimes(2);
      expect(sdkMocks.sandboxRenew).toHaveBeenNthCalledWith(1, 600);
      expect(sdkMocks.sandboxRenew).toHaveBeenNthCalledWith(2, 600);

      // Heartbeat timer must be cleared after exit
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(sdkMocks.sandboxRenew).toHaveBeenCalledTimes(2);

      // Legacy export sandbox also renews periodically
      sdkMocks.sandboxRenew.mockClear();
      await withLegacyExportOpenSandbox({
        sandboxId: 'app-long-export',
        legacyClaimName: 'fastgpt-session-app-long-old',
        endpoint: {
          baseUrl: 'http://legacy-docker-opensandbox.local:8090',
          image: 'ghcr.io/labring/fastgpt-sandbox:v0.3.0',
          runtime: 'docker'
        },
        fn: async () => {
          await vi.advanceTimersByTimeAsync(3 * 60_000 + 1_000);
        }
      });

      expect(sdkMocks.sandboxRenew).toHaveBeenCalledTimes(1);
      expect(sdkMocks.sandboxRenew).toHaveBeenCalledWith(600);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(sdkMocks.sandboxRenew).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
