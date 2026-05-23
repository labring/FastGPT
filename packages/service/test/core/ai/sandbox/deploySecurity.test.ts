import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REQUIRED_SANDBOX_API_KEY = '${SANDBOX_API_KEY:?Set SANDBOX_API_KEY before docker compose up}';

const findRepoRoot = (): string => {
  let dir = process.cwd();

  while (dir !== '/') {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    dir = resolve(dir, '..');
  }

  throw new Error('Cannot find repository root');
};

const collectYamlFiles = (dir: string): string[] => {
  if (!existsSync(dir)) return [];

  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      return collectYamlFiles(fullPath);
    }

    return fullPath.endsWith('.yml') || fullPath.endsWith('.yaml') ? [fullPath] : [];
  });
};

const repoRoot = findRepoRoot();
const sandboxComposeFiles = [
  ...collectYamlFiles(join(repoRoot, 'deploy/dev')),
  ...collectYamlFiles(join(repoRoot, 'deploy/docker')),
  ...collectYamlFiles(join(repoRoot, 'document/public/deploy/docker')),
  join(repoRoot, 'deploy/templates/docker-compose.prod.yml'),
  join(repoRoot, 'deploy/templates/docker-compose.dev.yml')
].filter((file) => {
  const content = readFileSync(file, 'utf8');
  return content.includes('opensandbox-config:') && content.includes('type = "docker"');
});

const relativeFile = (file: string) => relative(repoRoot, file);

describe('OpenSandbox docker deployment security', () => {
  it('keeps sandbox containers off FastGPT business networks', () => {
    expect(sandboxComposeFiles.length).toBeGreaterThan(0);

    for (const file of sandboxComposeFiles) {
      const content = readFileSync(file, 'utf8');

      expect(
        content,
        `${relativeFile(file)} must not attach sandbox containers to the OpenSandbox service network`
      ).not.toContain('network_mode = "fastgpt_opensandbox"');
      expect(
        content,
        `${relativeFile(file)} must force OpenSandbox-created containers onto Docker bridge`
      ).toContain('network_mode = "bridge"');
      expect(
        content,
        `${relativeFile(file)} must enable OpenSandbox egress policy enforcement`
      ).toContain('mode = "dns+nft"');
      expect(content, `${relativeFile(file)} must drop high-risk Linux capabilities`).toContain(
        'drop_capabilities = ["AUDIT_WRITE", "MKNOD", "NET_ADMIN", "NET_RAW", "SYS_ADMIN", "SYS_MODULE", "SYS_PTRACE", "SYS_TIME", "SYS_TTY_CONFIG"]'
      );
      expect(content, `${relativeFile(file)} must prevent privilege escalation`).toContain(
        'no_new_privileges = true'
      );
      expect(content, `${relativeFile(file)} must cap sandbox process count`).toContain(
        'pids_limit = 512'
      );
      expect(content, `${relativeFile(file)} must cap the OpenSandbox server memory`).toContain(
        'mem_limit: 1g'
      );
      expect(content, `${relativeFile(file)} must cap the OpenSandbox server CPU`).toContain(
        "cpus: '1.0'"
      );
      expect(content, `${relativeFile(file)} must cap the volume manager memory`).toContain(
        'mem_limit: 512m'
      );
      expect(content, `${relativeFile(file)} must cap the volume manager CPU`).toContain(
        "cpus: '0.5'"
      );
      expect(content, `${relativeFile(file)} must cap the volume manager process count`).toContain(
        'pids_limit: 256'
      );
      expect(
        content,
        `${relativeFile(file)} must keep OpenSandbox server Docker socket explicit`
      ).toContain('/var/run/docker.sock:/var/run/docker.sock # OpenSandbox server');
      expect(
        content,
        `${relativeFile(file)} must mount volume-manager Docker socket as read-only`
      ).toContain('/var/run/docker.sock:/var/run/docker.sock:ro # volume-manager');

      if (relativeFile(file).startsWith('deploy/dev/')) {
        expect(
          content,
          `${relativeFile(file)} must not expose OpenSandbox server on all interfaces`
        ).toContain('127.0.0.1:8090:8090');
        expect(
          content,
          `${relativeFile(file)} must not expose volume-manager on all interfaces`
        ).toContain('127.0.0.1:3005:3000');
        expect(
          content,
          `${relativeFile(file)} must not publish OpenSandbox server to 0.0.0.0`
        ).not.toContain('- 8090:8090');
        expect(
          content,
          `${relativeFile(file)} must not publish volume-manager to 0.0.0.0`
        ).not.toContain('- 3005:3000');
      }
    }
  });

  it('requires the same API key for FastGPT and OpenSandbox server configs', () => {
    expect(sandboxComposeFiles.length).toBeGreaterThan(0);

    for (const file of sandboxComposeFiles) {
      const content = readFileSync(file, 'utf8');

      expect(content, `${relativeFile(file)} must configure OpenSandbox server API key`).toContain(
        `api_key = "${REQUIRED_SANDBOX_API_KEY}"`
      );
      expect(content, `${relativeFile(file)} must not leave server API key empty`).not.toMatch(
        /api_key\s*=\s*""/
      );

      if (content.includes('AGENT_SANDBOX_OPENSANDBOX_API_KEY')) {
        expect(
          content,
          `${relativeFile(file)} must pass the same required API key to FastGPT`
        ).toContain(`AGENT_SANDBOX_OPENSANDBOX_API_KEY: ${REQUIRED_SANDBOX_API_KEY}`);
        expect(content, `${relativeFile(file)} must not leave FastGPT API key empty`).not.toMatch(
          /AGENT_SANDBOX_OPENSANDBOX_API_KEY:\s*(?:\n|$)/
        );
      }
    }
  });

  it('runs the agent sandbox image as a non-root user with a writable workspace', () => {
    const dockerfile = readFileSync(join(repoRoot, 'projects/agent-sandbox/Dockerfile'), 'utf8');
    const entrypoint = readFileSync(join(repoRoot, 'projects/agent-sandbox/entrypoint.sh'), 'utf8');

    expect(dockerfile).toContain('useradd --create-home --shell /bin/bash --uid 10001 sandbox');
    expect(dockerfile).toContain('mkdir -p /workspace');
    expect(dockerfile).not.toContain('touch /workspace/.keep');
    expect(dockerfile).toContain('chown -R sandbox:sandbox /home/sandbox /workspace');
    expect(dockerfile).toContain('USER sandbox');
    expect(dockerfile).not.toMatch(/\nUSER root\b/);

    expect(entrypoint).toContain('set -euo pipefail');
    expect(entrypoint).toContain('unset FASTGPT_SESSION_ID FASTGPT_WORKDIR');
    expect(entrypoint).toContain('Sandbox work directory is not writable');
  });
});
