import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';

const s3Mocks = vi.hoisted(() => ({
  resolveExistingObjectKey: vi.fn(),
  getObjectMetadata: vi.fn(),
  downloadObject: vi.fn(),
  removeObject: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/buckets/private', () => ({
  S3PrivateBucket: class MockS3PrivateBucket {
    resolveExistingObjectKey = s3Mocks.resolveExistingObjectKey;
    removeObject = s3Mocks.removeObject;
    client = {
      getObjectMetadata: s3Mocks.getObjectMetadata,
      downloadObject: s3Mocks.downloadObject
    };
  }
}));

import {
  deleteLegacyWorkspaceArchive,
  EMPTY_ZIP_BUFFER,
  inspectLegacyWorkspaceArchive
} from '@/migration/tasks/4180/sandbox_migration_shared/legacyArchiveS3';
import {
  checkLegacyVolumeExists,
  deleteLegacyVolume
} from '@/migration/tasks/4180/sandbox_migration_shared/legacyVolumeClient';
import {
  LegacySealosDevboxClient,
  SealosDevboxNotFoundError
} from '@/migration/tasks/4180/sandbox_migration_shared/sealosClient';
import {
  resolveLegacyOpenSandboxSourceConfig,
  sanitizeMigrationErrorMessage
} from '@/migration/tasks/4180/sandbox_migration_shared/env';
import { z } from 'zod';

describe('sandbox_migration_shared clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL = 'http://vm.local:3000';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN = 'vm-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies 22-byte empty zip vs non-empty zip and verifies S3 archive deletion', async () => {
    s3Mocks.resolveExistingObjectKey.mockResolvedValue('sandbox/archive/sbx-1/package.zip');
    s3Mocks.getObjectMetadata.mockResolvedValue({ contentLength: EMPTY_ZIP_BUFFER.length });
    s3Mocks.downloadObject.mockResolvedValue({
      body: Readable.from([EMPTY_ZIP_BUFFER])
    });

    await expect(inspectLegacyWorkspaceArchive('sbx-1')).resolves.toEqual({
      exists: true,
      key: 'sandbox/archive/sbx-1/package.zip',
      isEmptyZip: true
    });

    s3Mocks.removeObject.mockResolvedValue(undefined);
    await expect(deleteLegacyWorkspaceArchive('sbx-1')).resolves.toBeUndefined();
    expect(s3Mocks.removeObject).toHaveBeenCalledWith('sandbox/archive/sbx-1/package.zip');
  });

  it('calls volume-manager /v1/legacy-volumes with Bearer token and treats DELETE 404 as idempotent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ exists: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      )
      .mockResolvedValueOnce(new Response('not found', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkLegacyVolumeExists('fastgpt-session-sbx-1')).resolves.toBe(true);
    await expect(deleteLegacyVolume('fastgpt-session-sbx-1')).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://vm.local:3000/v1/legacy-volumes/fastgpt-session-sbx-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer vm-token' }
      })
    );
  });

  it('resolves paired cross-cluster legacy OpenSandbox config and falls back to v0.3 /v1/volumes when /v1/legacy-volumes route is absent', async () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://new-k8s-opensandbox.local:30928';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY = 'new-k8s-key';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'ghcr.io/labring/fastgpt-sandbox:v0.4.0';

    expect(() =>
      resolveLegacyOpenSandboxSourceConfig({
        AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL: 'http://old-docker.local:8090'
      })
    ).toThrow('Both AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL');

    const resolved = resolveLegacyOpenSandboxSourceConfig({
      AGENT_SANDBOX_LEGACY_OPENSANDBOX_BASEURL: 'http://old-docker.local:8090/',
      AGENT_SANDBOX_LEGACY_VOLUME_MANAGER_URL: 'http://old-docker-vm.local:3005/'
    });
    expect(resolved).toEqual({
      openSandbox: {
        baseUrl: 'http://old-docker.local:8090',
        apiKey: 'new-k8s-key',
        image: 'ghcr.io/labring/fastgpt-sandbox:v0.4.0',
        runtime: 'docker'
      },
      volumeManager: {
        url: 'http://old-docker-vm.local:3005',
        token: 'vm-token',
        volumeNamePrefix: 'fastgpt-session'
      }
    });

    const fetchMock = vi
      .fn()
      // GET /v1/legacy-volumes on un-upgraded v0.3.x returns text/plain 404
      .mockResolvedValueOnce(
        new Response('404 Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
        })
      )
      // DELETE /v1/legacy-volumes returns text/plain 404 -> falls back to DELETE /v1/volumes/:name
      .mockResolvedValueOnce(
        new Response('404 Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      checkLegacyVolumeExists('fastgpt-session-sbx-v03', undefined, {
        url: 'http://old-docker-vm.local:3005',
        token: 'old-vm-token',
        allowMissingRouteFallback: true
      })
    ).resolves.toBe(true);

    await expect(
      deleteLegacyVolume('fastgpt-session-sbx-v03', undefined, {
        url: 'http://old-docker-vm.local:3005',
        token: 'old-vm-token',
        volumeNamePrefix: 'fastgpt-session',
        allowLegacyV03Fallback: true
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://old-docker-vm.local:3005/v1/volumes/fastgpt-session-sbx-v03',
      expect.objectContaining({
        method: 'DELETE',
        headers: { Authorization: 'Bearer old-vm-token' }
      })
    );
  });

  it('resumes Paused Sealos Devbox, probes command readiness, pauses, and redacts token on errors', async () => {
    const fetchMock = vi
      .fn()
      // 1. initial info -> Paused
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { name: 'sbx-dev', state: { phase: 'Paused' } } }),
          { status: 200 }
        )
      )
      // 2. POST /resume
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200 }), { status: 200 }))
      // 3. poll info -> Running
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { name: 'sbx-dev', state: { phase: 'Running' } } }),
          { status: 200 }
        )
      )
      // 4. readiness probe exec -> exitCode 0
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 200, data: { exitCode: 0, stdout: '', stderr: '' } }), {
          status: 200
        })
      )
      // 5. pause info -> Running
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { name: 'sbx-dev', state: { phase: 'Running' } } }),
          { status: 200 }
        )
      )
      // 6. POST /pause
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200 }), { status: 200 }))
      // 7. missing devbox -> 404
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      // 8. HTTP 200 with business error code 500 on resume
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ code: 200, data: { name: 'sbx-err', state: { phase: 'Paused' } } }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 500, message: 'quota exceeded sealos-secret-jwt' }), {
          status: 200
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const client = new LegacySealosDevboxClient({
      baseUrl: 'https://devbox.sealos.local',
      token: 'sealos-secret-jwt'
    });
    await expect(client.resumeAndWaitReady({ name: 'sbx-dev' })).resolves.toBeUndefined();
    await expect(client.pause('sbx-dev')).resolves.toBeUndefined();
    await expect(client.resumeAndWaitReady({ name: 'missing-dev' })).rejects.toBeInstanceOf(
      SealosDevboxNotFoundError
    );
    await expect(client.resumeAndWaitReady({ name: 'sbx-err' })).rejects.toThrow(
      'Sealos Devbox resume failed (500): quota exceeded [REDACTED]'
    );
  });

  it('formats ZodError with readable field paths and redacts secrets in sanitizeMigrationErrorMessage', () => {
    const schema = z.object({
      AGENT_SANDBOX_SEALOS_BASEURL: z.string().url()
    });
    const parsed = schema.safeParse({ AGENT_SANDBOX_SEALOS_BASEURL: 'not-a-valid-url' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const msg = sanitizeMigrationErrorMessage(parsed.error);
      expect(msg).toContain('AGENT_SANDBOX_SEALOS_BASEURL');
      expect(msg).not.toBe('[ -> ]');
    }

    const secretMsg = sanitizeMigrationErrorMessage(
      new Error('Auth failed with Bearer super-secret-token at https://user:pass123@example.com'),
      ['extra-secret-9999']
    );
    expect(secretMsg).not.toContain('super-secret-token');
    expect(secretMsg).not.toContain('pass123');
    expect(secretMsg).toContain('Bearer [REDACTED]');
    expect(secretMsg).toContain('https://[REDACTED]@example.com');

    const longPythonTraceback = [
      'Migration container command failed (1): Traceback (most recent call last):',
      '  File "<string>", line 22, in <module>',
      '  File "/usr/lib/python3.11/shutil.py", line 197, in copyfileobj',
      '    while buf := fsrc_read(length):',
      '  File "/usr/lib/python3.11/zipfile.py", line 996, in read',
      '    data = self._read1(n)',
      "zipfile.BadZipFile: Bad CRC-32 for file 'sessions/chat_1/corrupted.txt'"
    ].join('\n');
    expect(sanitizeMigrationErrorMessage(new Error(longPythonTraceback))).toContain(
      "zipfile.BadZipFile: Bad CRC-32 for file 'sessions/chat_1/corrupted.txt'"
    );
  });
});
