import { Agent } from 'undici';
import { z } from 'zod';

const DOCKER_SOCKET_PATH = '/var/run/docker.sock';
const PREFERRED_DOCKER_API_VERSION: [number, number] = [1, 44];

/** 容器内外使用相同路径，通过 rshared 把 FUSE 挂载传播到 Docker 宿主机。 */
export const DEFAULT_DOCKER_JUICEFS_MOUNT_ROOT = '/var/lib/fastgpt/sandbox-mounts';

export const FASTGPT_DOCKER_CLAIM_LABEL = 'fastgpt.sandbox.claim';
export const FASTGPT_DOCKER_DEPLOYMENT_LABEL = 'fastgpt.deployment';

const DockerVersionResponseSchema = z.object({
  ApiVersion: z.string().optional(),
  MinAPIVersion: z.string().optional()
});

export const DockerVolumeInspectSchema = z.object({
  Name: z.string().min(1),
  Labels: z.record(z.string(), z.string()).nullable().optional(),
  Options: z.record(z.string(), z.string()).nullable().optional(),
  Mountpoint: z.string().optional()
});

export type DockerVolumeInspect = z.infer<typeof DockerVolumeInspectSchema>;

export type DockerSocketClient = {
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
};

function parseDockerApiVersion(raw: string): [number, number] | null {
  const trimmed = raw.trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2])];
}

function compareParsedVersion(a: [number, number], b: [number, number]): number {
  if (a[0] !== b[0]) {
    return a[0] - b[0];
  }
  return a[1] - b[1];
}

/**
 * 按 Docker 官方 SDK `NegotiateAPIVersion` 规则选择协议版本（返回如 `v1.44`）：
 * 1. 默认优先使用已验证兼容的目标版本 `1.44`；
 * 2. 若宿主机 daemon `ApiVersion` 低于 `1.44`（如 Docker 20.10 的 `1.41`），自动降级至 `ApiVersion`；
 * 3. 若新版 Docker 将 `MinAPIVersion` 抬高到 `1.44` 之上（如 `1.50`），自动抬升至 `MinAPIVersion`。
 */
export function selectDockerApiVersion(params: {
  serverApiVersion?: string | null;
  minApiVersion?: string | null;
}): string {
  let selected = PREFERRED_DOCKER_API_VERSION;

  const serverParsed = params.serverApiVersion
    ? parseDockerApiVersion(params.serverApiVersion)
    : null;
  if (serverParsed && compareParsedVersion(serverParsed, selected) < 0) {
    selected = serverParsed;
  }

  const minParsed = params.minApiVersion ? parseDockerApiVersion(params.minApiVersion) : null;
  if (minParsed && compareParsedVersion(minParsed, selected) > 0) {
    selected = minParsed;
  }

  return `v${selected[0]}.${selected[1]}`;
}

/**
 * 创建基于本机 `/var/run/docker.sock` 的 Docker Engine HTTP 客户端。
 *
 * 首次请求通过无版本前缀的 `GET /version` 与宿主机 Docker daemon 动态协商协议版本并按实例缓存；
 * 若协商请求本身失败，清除缓存以便后续重试。
 */
export function createDockerSocketClient(): DockerSocketClient {
  let dispatcher: Agent | undefined;
  let versionPromise: Promise<string> | undefined;

  const getDispatcher = (): Agent => {
    dispatcher ??= new Agent({ connect: { socketPath: DOCKER_SOCKET_PATH } });
    return dispatcher;
  };

  const resolveApiVersion = (): Promise<string> => {
    versionPromise ??= (async () => {
      const res = await fetch('http://localhost/version', {
        dispatcher: getDispatcher()
      } as RequestInit & { dispatcher: Agent });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Docker API version negotiation failed (${res.status}): ${text}`);
      }

      const headerApiVersion = res.headers.get('api-version');
      const body: unknown = await res.json().catch(() => ({}));
      const parsed = DockerVersionResponseSchema.safeParse(body);
      const serverApiVersion =
        (parsed.success ? parsed.data.ApiVersion : undefined) ?? headerApiVersion;
      const minApiVersion = parsed.success ? parsed.data.MinAPIVersion : undefined;

      if (!serverApiVersion || !parseDockerApiVersion(serverApiVersion)) {
        throw new Error('Docker daemon /version response did not include a valid ApiVersion');
      }

      return selectDockerApiVersion({
        serverApiVersion,
        minApiVersion
      });
    })().catch((error) => {
      versionPromise = undefined;
      throw error;
    });

    return versionPromise;
  };

  return {
    fetch: async (path: string, init?: RequestInit): Promise<Response> => {
      const apiVersion = await resolveApiVersion();
      return fetch(`http://localhost/${apiVersion}${path}`, {
        ...init,
        dispatcher: getDispatcher()
      } as RequestInit & { dispatcher: Agent });
    }
  };
}

/** 查询指定 Docker 命名卷详情；卷不存在（404）时返回 `null`。 */
export async function inspectDockerVolume(
  client: DockerSocketClient,
  name: string
): Promise<DockerVolumeInspect | null> {
  const res = await client.fetch(`/volumes/${encodeURIComponent(name)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Docker volume inspect failed (${res.status}): ${await res.text()}`);
  }
  return DockerVolumeInspectSchema.parse(await res.json());
}

/** 校验目标 Docker 卷未被任何容器（含已停止容器）挂载引用。 */
export async function assertDockerVolumeUnreferenced(
  client: DockerSocketClient,
  name: string
): Promise<void> {
  const filters = encodeURIComponent(JSON.stringify({ volume: [name] }));
  const res = await client.fetch(`/containers/json?all=1&filters=${filters}`);
  if (!res.ok) {
    throw new Error(`Docker container list failed (${res.status}): ${await res.text()}`);
  }
  if (z.array(z.unknown()).parse(await res.json()).length > 0) {
    throw new Error(`Docker volume is still referenced by a container: ${name}`);
  }
}

/** 幂等删除指定 Docker 卷（404 视为已删除）。 */
export async function deleteDockerVolume(client: DockerSocketClient, name: string): Promise<void> {
  const res = await client.fetch(`/volumes/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Docker volume delete failed (${res.status}): ${await res.text()}`);
  }
}
