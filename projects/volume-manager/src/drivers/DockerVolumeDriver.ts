import { execFile } from 'node:child_process';
import { chmod, chown, mkdir, readdir, readFile, rmdir, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  SandboxDeploymentIdSchema,
  SandboxVolumeNameSchema,
  type SandboxVolumeEnsureRequest,
  type SandboxVolumeEnsureResponse
} from '@fastgpt/global/core/ai/sandbox/volume';
import { VolumeOwnershipError, type IVolumeDriver } from './IVolumeDriver';
import { env } from '../env';
import {
  assertDockerVolumeUnreferenced,
  createDockerSocketClient,
  DEFAULT_DOCKER_JUICEFS_MOUNT_ROOT,
  deleteDockerVolume,
  DockerVolumeInspectSchema,
  FASTGPT_DOCKER_CLAIM_LABEL,
  FASTGPT_DOCKER_DEPLOYMENT_LABEL,
  inspectDockerVolume,
  type DockerVolumeInspect
} from '../utils/dockerApi';

const execFileAsync = promisify(execFile);

/**
 * 脱敏子进程错误文本中的含凭证 URI 与对象存储密钥，保留无凭证的普通端点（如 `--bucket`）便于排障。
 */
function redactJuicefsCommandError(message: string, secrets: string[] = []): string {
  let sanitized = message.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)[^\s'"/?#]+@[^\s'"]+/gi,
    '$1[REDACTED]'
  );

  for (const secret of secrets) {
    if (secret) {
      sanitized = sanitized.replaceAll(secret, '[REDACTED]');
    }
  }
  return sanitized;
}

const DEFAULT_JUICEFS_NAME = 'fastgpt-sandbox';
const DEFAULT_JUICEFS_TRASH_DAYS = 0;
const DEFAULT_JUICEFS_SUBDIR_PREFIX = '/workspaces';
const DEFAULT_JUICEFS_BUFFER_SIZE_MIB = 64;
const DEFAULT_JUICEFS_CACHE_SIZE_MIB = 0;
const DEFAULT_JUICEFS_INODE_QUOTA = 200_000;
const DEFAULT_SANDBOX_UID = 10001;
const DEFAULT_SANDBOX_GID = 10001;
const DEFAULT_STORAGE_CAPACITY_GIB = 1;

/**
 * Docker 模式下每个活跃沙箱独占一个 `juicefs mount -d --subdir=...` 进程，
 * 默认收敛单进程 SQL 元数据连接池上限与空闲回收时长（单位秒），避免百级并发沙箱耗尽 PG/MySQL/OceanBase 默认连接数。
 * 若用户在 `VM_JUICEFS_META_URL` 中显式指定同名参数，保留用户配置不覆盖。
 */
const DEFAULT_SQL_META_POOL_PARAMS = [
  ['max_open_conns', '4'],
  ['max_idle_conns', '1'],
  ['max_idle_time', '60']
] as const;

/** 开启 `--prefix-internal` 后，JuiceFS 仅暴露以下 4 个虚拟控制文件名；无前缀的 `.config` 等属于真实租户数据。 */
const JUICEFS_INTERNAL_FILES = new Set([
  '.jfs.accesslog',
  '.jfs.config',
  '.jfs.stats',
  '.jfs.trash'
]);

const DockerVolumeListSchema = z.object({
  Volumes: z.array(DockerVolumeInspectSchema).nullable().optional()
});

type MountState = 'absent' | 'mounted' | 'stale';

export type CommandExecutionParams = {
  bin: string;
  args: string[];
  env?: Record<string, string>;
};

export type DockerVolumeDriverOptions = {
  mountRoot?: string;
  runCommand?: (params: CommandExecutionParams) => Promise<void>;
};

/**
 * 规整 JuiceFS 元数据库连接串并将敏感凭证提取到子进程环境变量（`META_PASSWORD` / `ACCESS_KEY` / `SECRET_KEY`），
 * 避免 `juicefs mount -d` 守护进程或 CLI 参数在宿主机 `ps aux` 中暴露明文凭证。
 */
export function buildJuicefsCommandCredentials(params: {
  metaUrl: string;
  accessKey: string;
  secretKey: string;
}): { sanitizedMetaUrl: string; extraEnv?: Record<string, string> } {
  const extraEnv: Record<string, string> = {};

  const safeDecode = (value: string): string => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const splitUserPassword = (userInfo: string): { rawUser: string; rawPassword: string } => {
    const colonIndex = userInfo.indexOf(':');
    return colonIndex === -1
      ? { rawUser: userInfo, rawPassword: '' }
      : { rawUser: userInfo.slice(0, colonIndex), rawPassword: userInfo.slice(colonIndex + 1) };
  };

  const splitAuthorityAndPath = (rawRest: string) => {
    const boundaryIndex = rawRest.search(/[/?#]/);
    const authority = boundaryIndex === -1 ? rawRest : rawRest.slice(0, boundaryIndex);
    const pathAndQuery = boundaryIndex === -1 ? '' : rawRest.slice(boundaryIndex);
    const atIndex = authority.lastIndexOf('@');
    if (atIndex === -1) {
      return {
        hasUserInfo: false,
        rawUser: '',
        rawPassword: '',
        hostPort: authority,
        pathAndQuery
      };
    }
    return {
      hasUserInfo: true,
      ...splitUserPassword(authority.slice(0, atIndex)),
      hostPort: authority.slice(atIndex + 1),
      pathAndQuery
    };
  };

  const appendMissingSqlPoolParams = (urlWithoutPassword: string): string => {
    const queryIndex = urlWithoutPassword.indexOf('?');
    const base = queryIndex === -1 ? urlWithoutPassword : urlWithoutPassword.slice(0, queryIndex);
    const existingQuery = queryIndex === -1 ? '' : urlWithoutPassword.slice(queryIndex + 1);
    const existingParams = new URLSearchParams(existingQuery);
    const missingPairs = DEFAULT_SQL_META_POOL_PARAMS.filter(
      ([key]) => !existingParams.has(key)
    ).map(([key, value]) => `${key}=${value}`);

    if (missingPairs.length === 0) return urlWithoutPassword;
    return `${base}?${existingQuery ? `${existingQuery}&` : ''}${missingPairs.join('&')}`;
  };

  const sanitizedMetaUrl = (() => {
    const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(params.metaUrl);
    if (!schemeMatch) return params.metaUrl;

    const rawScheme = schemeMatch[1].toLowerCase();
    const rawRest = schemeMatch[2];
    const scheme =
      rawScheme === 'postgresql' ? 'postgres' : rawScheme === 'mariadb' ? 'mysql' : rawScheme;

    // 1. MySQL / MariaDB / OceanBase / SeekDB：统一规整为 Go MySQL DSN 并注入连接池默认值。
    if (scheme === 'mysql') {
      const goDsnMatch = /^(.*)@((?:tcp|unix)?\([^)]*\)(?:[/?].*)?)$/i.exec(rawRest);
      if (goDsnMatch) {
        const { rawUser, rawPassword } = splitUserPassword(goDsnMatch[1]);
        if (rawPassword) extraEnv.META_PASSWORD = rawPassword;
        return appendMissingSqlPoolParams(
          `mysql://${rawUser ? `${rawUser}@` : ''}${goDsnMatch[2]}`
        );
      }
      if (/^(?:tcp|unix)?\([^)]*\)(?:[/?].*)?$/i.test(rawRest)) {
        return appendMissingSqlPoolParams(`mysql://${rawRest}`);
      }

      const { rawUser, rawPassword, hostPort, pathAndQuery } = splitAuthorityAndPath(rawRest);
      if (!hostPort) {
        if (rawPassword) {
          throw new Error(
            'JuiceFS MySQL metaUrl with inline password requires an explicit host or unix(...) address'
          );
        }
        return params.metaUrl;
      }
      const decodedUser = safeDecode(rawUser);
      const decodedPassword = safeDecode(rawPassword);
      if (decodedPassword) extraEnv.META_PASSWORD = decodedPassword;
      const normalizedPath = !pathAndQuery
        ? '/'
        : pathAndQuery.startsWith('?')
          ? `/${pathAndQuery}`
          : pathAndQuery;
      return appendMissingSqlPoolParams(
        `mysql://${decodedUser ? `${decodedUser}@` : ''}tcp(${hostPort})${normalizedPath}`
      );
    }

    const { hasUserInfo, rawUser, rawPassword, hostPort, pathAndQuery } =
      splitAuthorityAndPath(rawRest);

    // 2. PostgreSQL / openGauss / KingbaseES：剥离密码并注入连接池默认值（支持 Unix Socket 空 hostPort，如 postgres://user:pass@/db?host=/var/run/postgresql）。
    if (scheme === 'postgres') {
      if (!hostPort && !pathAndQuery) return params.metaUrl;
      const decodedPassword = safeDecode(rawPassword);
      if (decodedPassword) extraEnv.META_PASSWORD = decodedPassword;
      const encodedUser = hasUserInfo && rawUser ? encodeURIComponent(safeDecode(rawUser)) : '';
      return appendMissingSqlPoolParams(
        `postgres://${encodedUser ? `${encodedUser}@` : ''}${hostPort}${pathAndQuery}`
      );
    }

    // 3. Redis / TiKV / SQLite3 等其他引擎：存在 userinfo 时剥离密码，绝不允许明文密码原样残留于命令行参数。
    if (!hasUserInfo) return params.metaUrl;
    const decodedPassword = safeDecode(rawPassword);
    if (decodedPassword) extraEnv.META_PASSWORD = decodedPassword;
    return `${rawScheme}://${rawUser ? `${rawUser}@` : ''}${hostPort}${pathAndQuery}`;
  })();

  if (params.accessKey) extraEnv.ACCESS_KEY = params.accessKey;
  if (params.secretKey) extraEnv.SECRET_KEY = params.secretKey;

  return {
    sanitizedMetaUrl,
    extraEnv: Object.keys(extraEnv).length > 0 ? extraEnv : undefined
  };
}

/** 将 `1Gi` / `1G` / `2048Mi` 规整为 JuiceFS `--capacity` 所需的 GiB 正数（默认 `1Gi`）。 */
export function parseStorageCapacityGiB(storageSize?: string): number {
  if (!storageSize) return DEFAULT_STORAGE_CAPACITY_GIB;
  const match = /^(\d+(?:\.\d+)?)\s*(Gi|G|Mi|M)?$/i.exec(storageSize.trim());
  if (!match) return DEFAULT_STORAGE_CAPACITY_GIB;
  const value = Number(match[1]);
  const unit = (match[2] ?? 'Gi').toLowerCase();
  return unit === 'mi' || unit === 'm'
    ? Math.max(1, Math.ceil(value / 1024))
    : Math.max(1, Math.ceil(value));
}

async function defaultRunCommand(params: CommandExecutionParams): Promise<void> {
  await execFileAsync(params.bin, params.args, {
    env: params.env ? { ...process.env, ...params.env } : process.env
  });
}

/** 区分未挂载与失效 FUSE；权限或其他 I/O 错误不能被当作空目录继续写入。 */
async function getMountState(mountPath: string): Promise<MountState> {
  const mounts = await readFile('/proc/mounts', 'utf-8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  });
  if (!mounts.split('\n').some((line) => line.split(' ')[1] === mountPath)) return 'absent';

  try {
    await stat(mountPath);
    return 'mounted';
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOTCONN' || error.code === 'EIO' || error.code === 'ESTALE')
    ) {
      return 'stale';
    }
    throw error;
  }
}

/** 挂载前将宿主机空挂载点锁死为 `root:root 0500`，防止未挂载时沙箱退化为写宿主机本地磁盘。 */
async function prepareMountPointDir(mountPath: string): Promise<void> {
  await mkdir(mountPath, { recursive: true });
  await chown(mountPath, 0, 0);
  await chmod(mountPath, 0o500);
}

async function readWorkspaceEntries(mountPath: string): Promise<string[]> {
  return (await readdir(mountPath)).filter((entry) => !JUICEFS_INTERNAL_FILES.has(entry));
}

async function finalizeWorkspaceDir(mountPath: string, mustBeEmpty: boolean): Promise<void> {
  if (mustBeEmpty && (await readWorkspaceEntries(mountPath)).length > 0) {
    throw new Error(`Refusing to initialize non-empty JuiceFS workspace subdir at ${mountPath}`);
  }
  await chown(mountPath, DEFAULT_SANDBOX_UID, DEFAULT_SANDBOX_GID);
  await chmod(mountPath, 0o755);
}

async function removeMountPointDir(mountPath: string): Promise<void> {
  await rmdir(mountPath).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  });
}

/** 管理 JuiceFS 子目录与 Docker bind 卷；同名卷的本进程操作按顺序执行。 */
export class DockerVolumeDriver implements IVolumeDriver {
  private readonly dockerClient = createDockerSocketClient();
  private readonly mountRoot: string;
  private readonly runCommand: (params: CommandExecutionParams) => Promise<void>;
  private readonly operations = new Map<string, Promise<void>>();
  private formatPromise?: Promise<void>;

  constructor(options: DockerVolumeDriverOptions = {}) {
    this.mountRoot = options.mountRoot ?? DEFAULT_DOCKER_JUICEFS_MOUNT_ROOT;
    this.runCommand = options.runCommand ?? defaultRunCommand;
  }

  private async withVolumeOperation<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(name) ?? Promise.resolve();
    const operation = previous.then(fn);
    const settled = operation.then(
      () => undefined,
      () => undefined
    );
    this.operations.set(name, settled);
    try {
      return await operation;
    } finally {
      if (this.operations.get(name) === settled) this.operations.delete(name);
    }
  }

  private getMountPath(claimName: string): string {
    return posix.join(this.mountRoot, claimName);
  }

  private getJuicefsSubdir(claimName: string): string {
    return `${DEFAULT_JUICEFS_SUBDIR_PREFIX}/${claimName}`;
  }

  private getJuicefsCredentials() {
    return buildJuicefsCommandCredentials({
      metaUrl: env.VM_JUICEFS_META_URL,
      accessKey: env.VM_JUICEFS_ACCESS_KEY,
      secretKey: env.VM_JUICEFS_SECRET_KEY
    });
  }

  /** 执行底层命令并在异常时剥离敏感参数，确保日志与上游响应不泄露凭证。 */
  private async execCommand(params: CommandExecutionParams): Promise<void> {
    try {
      await this.runCommand(params);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      let credentialSecrets: string[] = [];
      try {
        const { extraEnv } = this.getJuicefsCredentials();
        if (extraEnv) credentialSecrets = Object.values(extraEnv);
      } catch {}
      throw new Error(
        redactJuicefsCommandError(rawMessage, [
          env.VM_JUICEFS_META_URL,
          env.VM_JUICEFS_SECRET_KEY,
          env.VM_JUICEFS_ACCESS_KEY,
          ...credentialSecrets,
          ...(params.env ? Object.values(params.env) : [])
        ])
      );
    }
  }

  private async unmountPath(mountPath: string): Promise<void> {
    await this.execCommand({ bin: 'umount', args: [mountPath] }).catch(async () => {
      await this.execCommand({ bin: 'umount', args: ['-l', mountPath] });
    });
  }

  private async ensureFormatted(): Promise<void> {
    const { sanitizedMetaUrl, extraEnv } = this.getJuicefsCredentials();
    this.formatPromise ??= this.execCommand({
      bin: 'juicefs',
      args: [
        'format',
        '--no-update',
        '--storage',
        env.VM_JUICEFS_STORAGE,
        '--bucket',
        env.VM_JUICEFS_BUCKET,
        '--trash-days',
        String(DEFAULT_JUICEFS_TRASH_DAYS),
        sanitizedMetaUrl,
        DEFAULT_JUICEFS_NAME
      ],
      env: extraEnv
    }).catch((error) => {
      this.formatPromise = undefined;
      throw error;
    });

    await this.formatPromise;
  }

  private async ensureMounted(name: string): Promise<void> {
    const mountPath = this.getMountPath(name);
    const state = await getMountState(mountPath);
    if (state === 'mounted') return;
    if (state === 'stale') await this.unmountPath(mountPath);

    await this.ensureFormatted();
    await prepareMountPointDir(mountPath);
    const { sanitizedMetaUrl, extraEnv } = this.getJuicefsCredentials();
    await this.execCommand({
      bin: 'juicefs',
      args: [
        'mount',
        '-d',
        '--hide-internal',
        '--prefix-internal',
        `--subdir=${this.getJuicefsSubdir(name)}`,
        `--buffer-size=${DEFAULT_JUICEFS_BUFFER_SIZE_MIB}`,
        `--cache-size=${DEFAULT_JUICEFS_CACHE_SIZE_MIB}`,
        sanitizedMetaUrl,
        mountPath
      ],
      env: extraEnv
    });
  }

  private assertVolumeOwner(
    volume: DockerVolumeInspect,
    params: { claimName: string; deploymentId: string }
  ): void {
    if (
      volume.Name !== params.claimName ||
      volume.Labels?.app !== 'fastgpt' ||
      volume.Labels[FASTGPT_DOCKER_CLAIM_LABEL] !== params.claimName ||
      volume.Labels[FASTGPT_DOCKER_DEPLOYMENT_LABEL] !== params.deploymentId
    ) {
      throw new VolumeOwnershipError(`Docker volume ownership mismatch: ${params.claimName}`);
    }
  }

  /** 幂等创建或连接卷，设置配额与权限后才发布可挂载的 Docker 卷。 */
  async ensure(params: SandboxVolumeEnsureRequest): Promise<SandboxVolumeEnsureResponse> {
    const name = SandboxVolumeNameSchema.parse(params.claimName);
    const deploymentId = SandboxDeploymentIdSchema.parse(params.deploymentId);
    return this.withVolumeOperation(name, async () => {
      const existing = await inspectDockerVolume(this.dockerClient, name);
      const created = existing === null;
      if (existing) {
        this.assertVolumeOwner(existing, { claimName: name, deploymentId });
      }

      const mountPath = this.getMountPath(name);
      await this.ensureMounted(name);
      let quotaApplied = false;
      try {
        await finalizeWorkspaceDir(mountPath, created);
        const { sanitizedMetaUrl, extraEnv } = this.getJuicefsCredentials();
        await this.execCommand({
          bin: 'juicefs',
          args: [
            'quota',
            'set',
            sanitizedMetaUrl,
            '--path',
            this.getJuicefsSubdir(name),
            '--capacity',
            String(parseStorageCapacityGiB(params.storageSize)),
            '--inodes',
            String(DEFAULT_JUICEFS_INODE_QUOTA)
          ],
          env: extraEnv
        });
        quotaApplied = true;
        if (!created) return { claimName: name, created: false };

        const createRes = await this.dockerClient.fetch('/volumes/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Name: name,
            Driver: 'local',
            DriverOpts: { type: 'none', o: 'bind', device: mountPath },
            Labels: {
              app: 'fastgpt',
              [FASTGPT_DOCKER_CLAIM_LABEL]: name,
              [FASTGPT_DOCKER_DEPLOYMENT_LABEL]: deploymentId
            }
          })
        });
        if (!createRes.ok) {
          throw new Error(
            `Docker volume create failed (${createRes.status}): ${await createRes.text()}`
          );
        }
        return { claimName: name, created: true };
      } catch (error) {
        if (created) {
          await this.unmountPath(mountPath).catch(() => {});
          if (quotaApplied) {
            await Promise.resolve()
              .then(() => {
                const { sanitizedMetaUrl, extraEnv } = this.getJuicefsCredentials();
                return this.execCommand({
                  bin: 'juicefs',
                  args: [
                    'quota',
                    'delete',
                    sanitizedMetaUrl,
                    '--path',
                    this.getJuicefsSubdir(name)
                  ],
                  env: extraEnv
                });
              })
              .catch(() => {});
          }
          await removeMountPointDir(mountPath).catch(() => {});
        }
        throw error;
      }
    });
  }

  /** 停止空闲卷的 FUSE 进程，保留持久化文件和 Docker 卷元数据。 */
  async unmount(claimName: string, deploymentId: string): Promise<void> {
    const name = SandboxVolumeNameSchema.parse(claimName);
    const parsedDeploymentId = SandboxDeploymentIdSchema.parse(deploymentId);
    await this.withVolumeOperation(name, async () => {
      const existing = await inspectDockerVolume(this.dockerClient, name);
      if (!existing) return;

      this.assertVolumeOwner(existing, { claimName: name, deploymentId: parsedDeploymentId });
      const mountPath = this.getMountPath(name);
      if ((await getMountState(mountPath)) !== 'absent') {
        await this.execCommand({ bin: 'umount', args: [mountPath] });
      }
    });
  }

  /**
   * 先确认归属且没有容器引用，再通过 `juicefs rmr` 清空存储、卸载并删配额，最后删除 Docker 卷。
   * 任何存储阶段失败都保留 Docker 发现入口，让显式删除和反向 GC 能继续重试。
   */
  async remove(claimName: string, deploymentId: string): Promise<void> {
    const name = SandboxVolumeNameSchema.parse(claimName);
    const parsedDeploymentId = SandboxDeploymentIdSchema.parse(deploymentId);
    await this.withVolumeOperation(name, async () => {
      const existing = await inspectDockerVolume(this.dockerClient, name);
      const mountPath = this.getMountPath(name);
      if (!existing) {
        // Docker 卷不存在时无法通过标签核验 deploymentId 归属，禁止重新挂载或清空远端 JuiceFS 子目录；
        // 若本地仍残留 FUSE 挂载，仅安全卸载并回收空挂载点目录。
        if ((await getMountState(mountPath)) !== 'absent') {
          await this.execCommand({ bin: 'umount', args: [mountPath] });
        }
        await removeMountPointDir(mountPath);
        return;
      }

      this.assertVolumeOwner(existing, { claimName: name, deploymentId: parsedDeploymentId });
      await assertDockerVolumeUnreferenced(this.dockerClient, name);

      await this.ensureMounted(name);
      const entries = await readWorkspaceEntries(mountPath);
      if (entries.length > 0) {
        const rmrBatchSize = 500;
        for (let i = 0; i < entries.length; i += rmrBatchSize) {
          const batch = entries
            .slice(i, i + rmrBatchSize)
            .map((entry) => posix.join(mountPath, entry));
          await this.execCommand({
            bin: 'juicefs',
            args: ['rmr', '--', ...batch]
          });
        }
      }
      await this.execCommand({ bin: 'umount', args: [mountPath] });
      const { sanitizedMetaUrl, extraEnv } = this.getJuicefsCredentials();
      await this.execCommand({
        bin: 'juicefs',
        args: ['quota', 'delete', sanitizedMetaUrl, '--path', this.getJuicefsSubdir(name)],
        env: extraEnv
      });
      await removeMountPointDir(mountPath);
      await deleteDockerVolume(this.dockerClient, name);
    });
  }

  /** 仅列出当前部署的 FastGPT 卷；不接管无标签或其他部署的卷。 */
  async list(deploymentId: string): Promise<string[]> {
    const parsedDeploymentId = SandboxDeploymentIdSchema.parse(deploymentId);
    const filters = encodeURIComponent(
      JSON.stringify({
        label: [
          'app=fastgpt',
          FASTGPT_DOCKER_CLAIM_LABEL,
          `${FASTGPT_DOCKER_DEPLOYMENT_LABEL}=${parsedDeploymentId}`
        ]
      })
    );
    const res = await this.dockerClient.fetch(`/volumes?filters=${filters}`);
    if (!res.ok) {
      throw new Error(`Docker volume list failed (${res.status}): ${await res.text()}`);
    }
    return (DockerVolumeListSchema.parse(await res.json()).Volumes ?? [])
      .filter(
        (volume) =>
          volume.Labels?.app === 'fastgpt' &&
          volume.Labels[FASTGPT_DOCKER_CLAIM_LABEL] === volume.Name &&
          volume.Labels[FASTGPT_DOCKER_DEPLOYMENT_LABEL] === parsedDeploymentId
      )
      .map((volume) => volume.Name);
  }
}
