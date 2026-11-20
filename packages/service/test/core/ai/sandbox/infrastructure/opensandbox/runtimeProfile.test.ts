import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  getAgentSandboxDiskBytes: () => 5 * 1024 * 1024
}));

import {
  SANDBOX_WS_MAX_FRAME_BYTES,
  SANDBOX_WS_MAX_MESSAGE_BYTES
} from '@fastgpt/service/core/ai/sandbox/constants';
import {
  buildBaseSandboxRuntimeEnv,
  buildOpenSandboxCreateConfig,
  getSandboxBuiltinSkillsRootPath,
  getSandboxRuntimeProfile,
  getSandboxSkillsRootPath
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile';
import {
  formatImageSpec,
  octalNumberToPosixMode,
  parseImageSpec,
  posixModeToOctalNumber
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/utils';

describe('opensandbox runtimeProfile and utils', () => {
  beforeEach(() => {
    const snapshot = createDefaultInstanceConfig();
    snapshot.subservice.agentSandbox.enabled = true;
    Object.assign(snapshot.subservice.agentSandbox.opensandbox, {
      runtime: 'kubernetes',
      image: 'registry.example.com:5000/fastgpt/sandbox:1.2.3',
      cpuOvercommitFactor: 2,
      memoryOvercommitFactor: 2
    });
    Object.assign(snapshot.subservice.agentSandbox.common, {
      storageSizeGi: 10,
      cpuCount: 2,
      memoryMiB: 2048
    });
    snapshot.subservice.agentSandbox.proxy.secret = '';
    (global as any).systemInstanceConfig = snapshot;
  });

  it('parses and formats image specs including port-qualified registries and digests', () => {
    expect(parseImageSpec('localhost:5000/ns/image:v1')).toEqual({
      repository: 'localhost:5000/ns/image',
      tag: 'v1'
    });
    expect(parseImageSpec('localhost:5000/ns/image')).toEqual({
      repository: 'localhost:5000/ns/image'
    });
    expect(parseImageSpec('repo/img@sha256:deadbeef')).toEqual({
      repository: 'repo/img',
      digest: 'sha256:deadbeef'
    });
    expect(formatImageSpec({ repository: 'repo/img', tag: 'v1', digest: 'sha256:abc' })).toBe(
      'repo/img:v1@sha256:abc'
    );
  });

  it('converts POSIX bitmask and octal decimal file modes safely', () => {
    expect(posixModeToOctalNumber(0o755)).toBe(755);
    expect(octalNumberToPosixMode(755)).toBe(0o755);
    expect(() => posixModeToOctalNumber(-1)).toThrow(TypeError);
    expect(() => octalNumberToPosixMode(899)).toThrow(TypeError);
  });

  it('returns opensandbox static runtime profile and skill roots', () => {
    const profile = getSandboxRuntimeProfile();

    expect(profile).toEqual({
      provider: 'opensandbox',
      defaultImage: {
        repository: 'registry.example.com:5000/fastgpt/sandbox',
        tag: '1.2.3'
      },
      workDirectory: '/home/sandbox/workspace',
      homeDirectory: '/home/sandbox',
      entrypoint: '/usr/local/bin/entrypoint.sh',
      skillsRootPath: '/home/sandbox/workspace/skills',
      builtinSkillsRootPath: '/var/lib/fastgpt-runtime/skills'
    });
    expect(getSandboxSkillsRootPath('/custom/')).toBe('/custom/skills');
    expect(getSandboxBuiltinSkillsRootPath('/var/lib/custom/')).toBe('/var/lib/custom/skills');
  });

  it('builds base runtime env with container runtime dir and workdir under HOME', () => {
    const env = buildBaseSandboxRuntimeEnv({
      workDirectory: '/home/sandbox/workspace/'
    });

    expect(env).toEqual({
      HOME: '/home/sandbox',
      FASTGPT_WORKDIR: '/home/sandbox/workspace',
      FASTGPT_RUNTIME_DIR: '/var/lib/fastgpt-runtime',
      FASTGPT_IDE_MAX_FILE_BYTES: String(5 * 1024 * 1024),
      FASTGPT_IDE_WS_MAX_MESSAGE_BYTES: String(SANDBOX_WS_MAX_MESSAGE_BYTES),
      FASTGPT_IDE_WS_MAX_FRAME_BYTES: String(SANDBOX_WS_MAX_FRAME_BYTES),
      PIP_BREAK_SYSTEM_PACKAGES: '1',
      PIP_NO_CACHE_DIR: '1'
    });

    getTestInstanceConfig().subservice.agentSandbox.proxy.secret = 'proxy-secret-value';
    const authedEnv = buildBaseSandboxRuntimeEnv({
      workDirectory: '/home/sandbox/workspace'
    });
    expect(authedEnv).toEqual(env);

    // Docker 运行时注入 FASTGPT_DISK_SOFT_LIMIT_BYTES；Kubernetes 下不注入。
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';
    const dockerEnv = buildBaseSandboxRuntimeEnv({
      workDirectory: '/home/sandbox/workspace'
    });
    expect(dockerEnv).toEqual({
      ...env,
      FASTGPT_DISK_SOFT_LIMIT_BYTES: String(5 * 1024 * 1024)
    });
  });

  it('derives kubernetes cpu/memory limits and overcommit requests without ephemeral-storage', () => {
    const spec = buildOpenSandboxCreateConfig({
      createConfig: {
        networkPolicy: {
          defaultAction: 'deny',
          egress: [{ action: 'allow', target: '127.0.0.0/8' }]
        }
      }
    });

    expect(spec.entrypoint).toEqual(['/usr/local/bin/entrypoint.sh']);
    expect(spec.resourceLimits).toEqual({
      cpuCount: 2,
      memoryMiB: 2048
    });
    expect(spec.resourceRequests).toEqual({
      cpuCount: 1,
      memoryMiB: 1024
    });
    expect(spec.networkPolicy).toBeUndefined();
    expect('secureAccess' in spec).toBe(false);

    getTestInstanceConfig().subservice.agentSandbox.opensandbox.cpuOvercommitFactor = 1;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.memoryOvercommitFactor = 1;
    expect(buildOpenSandboxCreateConfig().resourceRequests).toBeUndefined();
    expect(
      buildOpenSandboxCreateConfig({
        createConfig: { resourceRequests: { cpuCount: 0.5 } }
      }).resourceRequests
    ).toEqual({
      cpuCount: 0.5
    });
  });

  it('enforces protected internal network deny rules on docker runtime', () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime = 'docker';

    const spec = buildOpenSandboxCreateConfig({
      createConfig: {
        networkPolicy: {
          defaultAction: 'deny',
          egress: [
            { action: 'allow', target: '10.0.0.0/8' },
            { action: 'deny', target: 'localhost' },
            { action: 'deny', target: '198.51.100.0/24' }
          ]
        }
      }
    });

    expect('secureAccess' in spec).toBe(false);
    expect(spec.resourceRequests).toBeUndefined();
    expect(spec.resourceLimits).toEqual({ cpuCount: 2, memoryMiB: 2048 });
    expect(spec.networkPolicy?.defaultAction).toBe('allow');
    expect(spec.networkPolicy?.egress).toEqual(
      expect.arrayContaining([
        { action: 'deny', target: 'localhost' },
        { action: 'deny', target: '127.0.0.0/8' },
        { action: 'deny', target: '198.51.100.0/24' }
      ])
    );
    expect(spec.networkPolicy?.egress?.filter((rule) => rule.target === 'localhost')).toHaveLength(
      1
    );
    expect(spec.networkPolicy?.egress?.some((rule) => rule.action === 'allow')).toBe(false);
  });
});
