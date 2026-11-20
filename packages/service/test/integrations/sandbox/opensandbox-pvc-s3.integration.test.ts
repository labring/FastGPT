import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import JSZip from 'jszip';
import { Agent } from 'undici';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { redisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
  OPEN_SANDBOX_DEFAULT_ROOT_PATH
} from '@fastgpt/global/core/ai/sandbox/constants';
import { createTarZstStream, parseTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoS3TTL } from '@fastgpt/service/common/s3/models/ttl';
import { S3SandboxSource } from '@fastgpt/service/common/s3/sources/sandbox';
import { S3SkillSource } from '@fastgpt/service/common/s3/sources/skill';
import { getAgentSandboxDiskBytes } from '@fastgpt/service/core/ai/sandbox/config';
import {
  ORPHAN_VOLUME_GRACE_PERIOD_MS,
  SandboxInstanceStatusEnum
} from '@fastgpt/service/core/ai/sandbox/constants';
import { archiveSandboxResourceNow } from '@fastgpt/service/core/ai/sandbox/application/archive';
import { getAuthenticatedIdeAgentEndpoint } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import {
  deleteSandboxResource,
  reconcileOrphanSandboxResources,
  reconcileOrphanSandboxVolumes
} from '@fastgpt/service/core/ai/sandbox/application/resource';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { prepareSandboxRuntimeMirrors } from '@fastgpt/service/core/ai/sandbox/application/runtime/mirrors';
import type { SandboxClientQuery } from '@fastgpt/service/core/ai/sandbox/application/runtime/type';
import { saveDeploySkillFromSandbox } from '@fastgpt/service/core/ai/sandbox/application/skillEdit/deploy';
import {
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox,
  streamSkillEditWorkspaceTarZst
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import {
  createRuntimeOpenSandboxClient,
  disconnectSandbox
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/opensandbox';
import { getVolumeManagerEnvConfig } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/config';
import {
  deleteSessionVolume,
  ensureSessionVolume,
  getOrphanVolumeMarkerKey,
  getSessionVolumeClaimName,
  listSessionVolumes
} from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { buildRuntimeHash, joinSandboxPath } from '@fastgpt/service/core/ai/sandbox/utils';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { importSkill } from '@fastgpt/service/core/ai/skill/manage';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getSandboxIntegrationProvider } from './config';
import { cleanupAppSandbox } from './fixtures';

const { Types } = connectionMongo;
const integrationProvider = getSandboxIntegrationProvider();
const dockerSocketPath = process.env.VM_DOCKER_SOCKET ?? '/var/run/docker.sock';
const dockerApiVersion = process.env.VM_DOCKER_API_VERSION ?? 'v1.44';
const dockerDispatcher = new Agent({ connect: { socketPath: dockerSocketPath } });

const dockerApiFetch = (path: string, init?: RequestInit) =>
  fetch(`http://localhost/${dockerApiVersion}${path}`, {
    ...init,
    dispatcher: dockerDispatcher
  } as RequestInit & { dispatcher: Agent });

const createAppQuery = async (
  label: string
): Promise<{ query: SandboxClientQuery; teamId: string }> => {
  const teamId = new Types.ObjectId().toString();
  const app = await MongoApp.create({
    name: `OpenSandbox PVC S3 ${label}`,
    type: AppTypeEnum.simple,
    teamId: new Types.ObjectId(teamId),
    tmbId: new Types.ObjectId(),
    modules: []
  });
  const sourceId = String(app._id);
  const userId = `pvc-s3-user-${randomUUID()}`;
  return {
    teamId,
    query: {
      sandboxId: getRunningSandboxId({
        sourceType: ChatSourceTypeEnum.app,
        sourceId,
        userId
      }),
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      userId,
      chatId: `pvc-s3-chat-${randomUUID()}`
    }
  };
};

/** 从 `AGENT_SANDBOX_OPENSANDBOX_IMAGE` 推导成对的非 root / root 测试镜像，避免依赖不存在的 ROOT_IMAGE 变量。 */
const deriveSandboxImageVariants = (configuredImage: string) => {
  const trimmed = configuredImage.trim();
  const pattern = /(fastgpt-agent-sandbox)(?:-root)?(?=$|[:@/])/;
  const match = pattern.exec(trimmed);
  if (!match) {
    throw new Error(
      `In-place image upgrade test requires fastgpt-agent-sandbox[-root] image, got: ${trimmed}`
    );
  }
  const isRoot = match[0] === 'fastgpt-agent-sandbox-root';
  return {
    nonRootImage: isRoot ? trimmed.replace(pattern, 'fastgpt-agent-sandbox') : trimmed,
    rootImage: isRoot ? trimmed : trimmed.replace(pattern, 'fastgpt-agent-sandbox-root'),
    startedAsRoot: isRoot
  };
};

const verifyAptMirrorOnRootSandbox = async (
  sandbox: Awaited<ReturnType<typeof getSandboxClient>>['opensandbox']
) => {
  const aptPath = '/etc/apt/sources.list.d/debian.sources';
  const aptBackupPath = joinSandboxPath(
    OPEN_SANDBOX_CONTAINER_RUNTIME_DIR,
    'mirrors',
    `${buildRuntimeHash(aptPath).slice(7)}.backup`
  );
  const [origApt] = await sandbox.readFiles([aptPath]);
  if (!origApt || origApt.error) return;

  const origText = Buffer.from(origApt.content).toString('utf8');
  await prepareSandboxRuntimeMirrors({
    sandbox,
    config: { aptMirror: 'https://mirrors.example.com/debian' }
  });
  const [configuredApt, backupApt] = await sandbox.readFiles([aptPath, aptBackupPath]);
  expect(Buffer.from(configuredApt!.content).toString('utf8')).toContain(
    'https://mirrors.example.com/debian'
  );
  expect(Buffer.from(backupApt!.content).toString('utf8')).toBe(origText);

  await prepareSandboxRuntimeMirrors({ sandbox, config: {} });
  const [restoredApt, removedBackup] = await sandbox.readFiles([aptPath, aptBackupPath]);
  expect(Buffer.from(restoredApt!.content).toString('utf8')).toBe(origText);
  expect(removedBackup?.error).toBeTruthy();
};

describe.skipIf(!integrationProvider).sequential('OpenSandbox PVC & S3 Edge Integration', () => {
  const originalSandboxBucket = global.sandboxBucket;
  const originalSkillBucket = global.skillBucket;
  const originalFeConfigs = global.feConfigs;
  let s3Sandbox: S3SandboxSource;
  let s3Skill: S3SkillSource;
  const cleanupTasks: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    const { mongoSessionRun: actualMongoSessionRun } = await vi.importActual<
      typeof import('@fastgpt/service/common/mongo/sessionRun')
    >('@fastgpt/service/common/mongo/sessionRun');
    vi.mocked(mongoSessionRun).mockImplementation(actualMongoSessionRun);

    s3Sandbox = new S3SandboxSource();
    s3Skill = new S3SkillSource();
    await s3Sandbox.client.ensureBucket();
    global.sandboxBucket = s3Sandbox;
    global.skillBucket = s3Skill;
    global.feConfigs = {
      ...(originalFeConfigs ?? {}),
      show_agent_sandbox: true
    } as typeof global.feConfigs;
  });

  afterEach(async () => {
    while (cleanupTasks.length > 0) {
      const task = cleanupTasks.pop()!;
      await task().catch(() => undefined);
    }
  });

  afterAll(async () => {
    global.sandboxBucket = originalSandboxBucket;
    global.skillBucket = originalSkillBucket;
    global.feConfigs = originalFeConfigs;
    await dockerDispatcher.close().catch(() => undefined);
  });

  it('archives >5MiB full $HOME via real RustFS Multipart, preserves caches/dotfiles/symlinks/PAX, leaves 0 tmp files, and cleans superseded CoW generations', async () => {
    const { query } = await createAppQuery('multipart-cow');
    cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

    // 1. 创建运行态沙盒并写入 >5.5MiB 不可压缩随机文件、可执行脚本、超长 UTF-8 路径、软链、依赖缓存与 $HOME 点文件
    let client = await getSandboxClient(query);
    const largePayload = Buffer.alloc(6 * 1024 * 1024);
    for (let i = 0; i < largePayload.length; i += 4) {
      largePayload.writeUInt32LE(((i * 2654435761) ^ (i >>> 3)) >>> 0, i);
    }
    const largeSha256 = createHash('sha256').update(largePayload).digest('hex');
    const longDir = `pax-${'a'.repeat(105)}`;

    await client.opensandbox.createDirectories([
      'bin',
      longDir,
      'links',
      'node_modules/pkg',
      '.venv/lib',
      '__pycache__',
      '.cache/sub'
    ]);
    await client.opensandbox.writeFiles([
      { path: 'large.bin', data: largePayload },
      { path: 'bin/run.sh', data: '#!/bin/sh\necho ok\n', mode: 0o755 },
      { path: `${longDir}/中文-文件.txt`, data: 'pax-utf8-verified' },
      { path: 'target.txt', data: 'symlink-target-body' },
      { path: 'node_modules/pkg/big.js', data: 'preserved-node-modules' },
      { path: '.venv/lib/mod.py', data: 'preserved-venv' },
      { path: '__pycache__/mod.pyc', data: 'preserved-pycache' },
      { path: '.cache/sub/data.bin', data: 'preserved-cache' },
      { path: 'bin/.cache', data: 'regular-file-named-dot-cache' },
      { path: '/home/sandbox/.home-persist.txt', data: 'home-dotfile-preserved' }
    ]);
    const symlinkRes = await client.opensandbox.execute('ln -s ../target.txt links/ref.txt', {
      workingDirectory: OPEN_SANDBOX_DEFAULT_ROOT_PATH
    });
    expect(symlinkRes.exitCode).toBe(0);

    const createdDoc = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    const firstClaimName = getSessionVolumeClaimName(createdDoc?.storage);
    expect(firstClaimName).toBeTruthy();
    expect(createdDoc?.instanceId).toBeTruthy();
    await client.opensandbox.close();

    // 2. 触发真实归档：>5MiB 触发 S3SandboxSource Multipart 流式上传至 RustFS，并验证容器 /tmp 无临时归档残留
    const archive1 = await archiveSandboxResourceNow(createdDoc!);
    expect(archive1.status).toBe('success');

    const archivedDoc1 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    expect(archivedDoc1?.status).toBe(SandboxInstanceStatusEnum.archived);
    expect(archivedDoc1?.instanceId).toBeUndefined();
    expect(archivedDoc1?.storage?.volumes).toBeUndefined();
    const archiveMeta1 = archivedDoc1?.storage?.archive;
    expect(archiveMeta1?.format).toBe('tar.zst');
    expect(archiveMeta1?.sizeBytes).toBeGreaterThan(5 * 1024 * 1024);
    expect(await s3Sandbox.isObjectExists(archiveMeta1!.objectKey)).toBe(true);
    expect(await listSessionVolumes()).not.toContain(firstClaimName);

    // 3. 冷恢复到新 generation 卷，验证大文件 SHA256、权限、软链、PAX UTF-8、缓存目录、$HOME 点文件及 /tmp 零落盘
    client = await getSandboxClient(query);
    const restoredDoc = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    const secondClaimName = getSessionVolumeClaimName(restoredDoc?.storage);
    expect(secondClaimName).toBeTruthy();
    expect(secondClaimName).not.toBe(firstClaimName);

    const verifyCmd = await client.opensandbox.execute(
      [
        `sha256sum large.bin`,
        `stat -c '%a' bin/run.sh`,
        `readlink links/ref.txt`,
        `cat links/ref.txt`,
        `cat "${longDir}/中文-文件.txt"`,
        `cat bin/.cache`,
        `cat node_modules/pkg/big.js`,
        `cat .venv/lib/mod.py`,
        `cat __pycache__/mod.pyc`,
        `cat .cache/sub/data.bin`,
        `cat /home/sandbox/.home-persist.txt`,
        `find /tmp -maxdepth 2 \\( -name '*.tar*' -o -name '*.zst' -o -name '*.zip' \\) | wc -l`
      ].join(' && '),
      { workingDirectory: OPEN_SANDBOX_DEFAULT_ROOT_PATH }
    );
    expect(verifyCmd.exitCode).toBe(0);
    expect(verifyCmd.stdout).toContain(largeSha256);
    expect(verifyCmd.stdout).toContain('755');
    expect(verifyCmd.stdout).toContain('../target.txt');
    expect(verifyCmd.stdout).toContain('symlink-target-body');
    expect(verifyCmd.stdout).toContain('pax-utf8-verified');
    expect(verifyCmd.stdout).toContain('regular-file-named-dot-cache');
    expect(verifyCmd.stdout).toContain('preserved-node-modules');
    expect(verifyCmd.stdout).toContain('preserved-venv');
    expect(verifyCmd.stdout).toContain('preserved-pycache');
    expect(verifyCmd.stdout).toContain('preserved-cache');
    expect(verifyCmd.stdout).toContain('home-dotfile-preserved');
    expect(verifyCmd.stdout.trim().split('\n').at(-1)?.trim()).toBe('0');

    // 4. 第二代 CoW 归档：新对象提交成功后，第一代 S3 .tar.zst 应被自动清理
    await client.exec('printf second-gen > second.txt');
    await client.opensandbox.close();
    const archive2 = await archiveSandboxResourceNow(restoredDoc!);
    expect(archive2.status).toBe('success');

    const archivedDoc2 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    const archiveMeta2 = archivedDoc2?.storage?.archive;
    expect(archiveMeta2?.objectKey).toBeTruthy();
    expect(archiveMeta2?.objectKey).not.toBe(archiveMeta1!.objectKey);
    expect(await s3Sandbox.isObjectExists(archiveMeta2!.objectKey)).toBe(true);
    // 等待异步 deleteSupersededSandboxArchives 完成
    await expect
      .poll(() => s3Sandbox.isObjectExists(archiveMeta1!.objectKey), { timeout: 10_000 })
      .toBe(false);
  });

  it('short-circuits 204 empty $HOME archive without S3 upload and restores empty volume cleanly', async () => {
    const { query } = await createAppQuery('empty-204');
    cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

    let client = await getSandboxClient(query);
    await client.opensandbox.execute(
      'find /home/sandbox -mindepth 1 -maxdepth 1 ! -name lost+found -exec rm -rf {} +'
    );
    await client.opensandbox.close();

    const beforeDoc = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    const archiveRes = await archiveSandboxResourceNow(beforeDoc!);
    expect(archiveRes.status).toBe('success');

    const archived = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    expect(archived?.status).toBe(SandboxInstanceStatusEnum.archived);
    expect(archived?.storage?.archive?.sizeBytes).toBe(0);
    expect(await s3Sandbox.isObjectExists(archived!.storage!.archive!.objectKey)).toBe(false);

    // 冷恢复 sizeBytes=0 应不访问 S3 并建新空卷成功拉起（entrypoint 自动补建 /home/sandbox/workspace）
    client = await getSandboxClient(query);
    const lsOut = await client.exec('ls -la');
    expect(lsOut.exitCode).toBe(0);
    await client.opensandbox.close();
  });

  it('enforces per-instance ide-agent 0600 password auth and never extracts outside the target directory', async () => {
    const { query } = await createAppQuery('ide-agent-security');
    cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

    const client = await getSandboxClient(query);
    await client.opensandbox.writeFiles([{ path: 'keep.txt', data: 'do-not-overwrite' }]);

    // 1. 核验 /var/lib/fastgpt-runtime/.fastgpt-ide-agent-password 存在且为 0600
    const permCheck = await client.exec(
      `stat -c "%a %u" ${OPEN_SANDBOX_CONTAINER_RUNTIME_DIR}/.fastgpt-ide-agent-password`
    );
    expect(permCheck.exitCode).toBe(0);
    expect(permCheck.stdout.trim()).toBe('600 10001');

    const endpoint = await getAuthenticatedIdeAgentEndpoint({
      sandbox: client.opensandbox,
      port: 1319
    });
    const baseUrl = /^[a-z]+:\/\//i.test(endpoint.url)
      ? endpoint.url.replace(/\/+$/, '')
      : `${endpoint.protocol}://${endpoint.url.replace(/\/+$/, '')}`;
    const headersWithoutAgentToken = { ...endpoint.headers };
    delete headersWithoutAgentToken['x-fastgpt-agent-token'];
    const extract = (body: Buffer) =>
      fetch(`${baseUrl}/archive/extract`, {
        method: 'POST',
        headers: { ...endpoint.headers, 'Content-Type': 'application/zstd' },
        body: new Uint8Array(body)
      });

    // 2. 无口令或错误口令访问 1319 必须被 401 拒绝
    const unauthPack = await fetch(`${baseUrl}/archive/pack`, {
      method: 'POST',
      headers: headersWithoutAgentToken
    });
    expect(unauthPack.status).toBe(401);

    const wrongTokenExtract = await fetch(`${baseUrl}/archive/extract`, {
      method: 'POST',
      headers: {
        ...headersWithoutAgentToken,
        'x-fastgpt-agent-token': 'wrong-agent-token-xyz'
      },
      body: Buffer.from('corrupt')
    });
    expect(wrongTokenExtract.status).toBe(401);

    // 3. 损坏 zstd 载荷被拒绝且现有文件完好
    expect((await extract(Buffer.from('not-valid-zstd-payload'))).ok).toBe(false);

    // 4. `..` 条目由 tar 解包语义跳过；`esc -> /tmp` 后经软链父目录写入被拒绝
    const slipTarZst = await buffer(
      createTarZstStream([
        { path: '../tar-slip-escape.txt', type: 'file', mode: 0o644, content: Buffer.from('x') }
      ])
    );
    await extract(slipTarZst);

    const symlinkEscapeTarZst = await buffer(
      createTarZstStream([
        { path: 'esc', type: 'symlink', mode: 0o777, linkname: '/tmp' },
        {
          path: 'esc/pwned-symlink.txt',
          type: 'file',
          mode: 0o644,
          content: Buffer.from('escaped')
        }
      ])
    );
    expect((await extract(symlinkEscapeTarZst)).ok).toBe(false);

    const checkPostAttack = await client.opensandbox.execute(
      'cat keep.txt && test ! -e /tmp/pwned-symlink.txt && test ! -e /home/sandbox/tar-slip-escape.txt && test ! -e /tar-slip-escape.txt && echo SAFE',
      { workingDirectory: OPEN_SANDBOX_DEFAULT_ROOT_PATH }
    );
    expect(checkPostAttack.exitCode).toBe(0);
    expect(checkPostAttack.stdout).toContain('do-not-overwrite');
    expect(checkPostAttack.stdout).toContain('SAFE');
    await client.opensandbox.close();
  });

  it('performs same-volume in-place image upgrade on running and stopped sandboxes and tests aptMirror on root image', async () => {
    const configuredImage = process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE!.trim();
    const { nonRootImage, rootImage, startedAsRoot } = deriveSandboxImageVariants(configuredImage);
    const firstExpectedUid = startedAsRoot ? '0' : '10001';
    const runningUpgradeImage = startedAsRoot ? nonRootImage : rootImage;
    const runningExpectedUid = startedAsRoot ? '10001' : '0';

    const { query } = await createAppQuery('inplace-upgrade');
    cleanupTasks.push(() => cleanupAppSandbox(query, s3Sandbox));

    const client1 = await getSandboxClient(query);
    expect((await client1.exec('id -u')).stdout.trim()).toBe(firstExpectedUid);
    await client1.exec('printf persist-across-upgrade > upgrade-file.txt');
    if (startedAsRoot) {
      await verifyAptMirrorOnRootSandbox(client1.opensandbox);
    }
    const doc1 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    const volumeClaim = getSessionVolumeClaimName(doc1?.storage);
    await client1.opensandbox.close();

    // 1. running 态原地换镜像（nonroot <-> root），验证不走 S3 归档并复用同一个 claimName
    let upgradeStarted = false;
    let upgradeCompleted = false;
    const client2 = await getSandboxClient(query, {
      createConfig: { image: runningUpgradeImage },
      onUpgrade: () => {
        upgradeStarted = true;
      },
      onUpgradeComplete: () => {
        upgradeCompleted = true;
      }
    });
    expect(upgradeStarted).toBe(true);
    expect(upgradeCompleted).toBe(true);
    expect((await client2.exec('id -u')).stdout.trim()).toBe(runningExpectedUid);
    expect((await client2.exec('cat upgrade-file.txt')).stdout).toBe('persist-across-upgrade');

    const doc2 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    expect(getSessionVolumeClaimName(doc2?.storage)).toBe(volumeClaim);
    expect(doc2?.instanceId).not.toBe(doc1?.instanceId);
    expect(doc2?.storage?.archive).toBeUndefined();

    // 2. 在 root 镜像上验证 aptMirror 备份与恢复（/etc/apt/sources.list.d/debian.sources + mirrors/<hash>.backup）
    if (!startedAsRoot) {
      await verifyAptMirrorOnRootSandbox(client2.opensandbox);
    }

    // 3. stopped 态原地换回初始 AGENT_SANDBOX_OPENSANDBOX_IMAGE 镜像
    await client2.stop();
    const client3 = await getSandboxClient(query, {
      createConfig: { image: configuredImage }
    });
    expect((await client3.exec('id -u')).stdout.trim()).toBe(firstExpectedUid);
    expect((await client3.exec('cat upgrade-file.txt')).stdout).toBe('persist-across-upgrade');
    const doc3 = await MongoSandboxInstance.findOne({ sandboxId: query.sandboxId }).lean();
    expect(getSessionVolumeClaimName(doc3?.storage)).toBe(volumeClaim);
    await client3.opensandbox.close();
  });

  it('enforces volume-manager auth/validation/ownership and executes two-phase orphan volume & container GC', async () => {
    const vmConfig = getVolumeManagerEnvConfig();
    const prefix = vmConfig.volumeNamePrefix.toLowerCase();
    const foreignVol = `${prefix}-foreign-${randomUUID().slice(0, 8)}-0`;
    const unlabeledVol = `${prefix}-unlabeled-${randomUUID().slice(0, 8)}`;
    const orphanSandboxId = `app-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const orphanManagedVol = `${prefix}-${orphanSandboxId}-deadbeef`;
    const orphanLegacyVol = `${prefix}-app-${randomUUID().replaceAll('-', '').slice(0, 16)}`;

    cleanupTasks.push(async () => {
      for (const vol of [foreignVol, unlabeledVol, orphanManagedVol, orphanLegacyVol]) {
        await redisCacheAdapter.delete(getOrphanVolumeMarkerKey(vol)).catch(() => undefined);
        await dockerApiFetch(`/volumes/${encodeURIComponent(vol)}`, { method: 'DELETE' }).catch(
          () => undefined
        );
      }
    });

    // 1. volume-manager 鉴权与入参校验
    const unauthRes = await fetch(`${vmConfig.url}/v1/volumes`);
    expect(unauthRes.status).toBe(401);

    const badTokenRes = await fetch(`${vmConfig.url}/v1/volumes`, {
      headers: { Authorization: 'Bearer wrong-vm-token' }
    });
    expect(badTokenRes.status).toBe(401);

    const invalidNameRes = await fetch(`${vmConfig.url}/v1/volumes/ensure`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vmConfig.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ claimName: 'INVALID_UPPER_CASE' })
    });
    expect(invalidNameRes.status).toBe(400);

    // 2. 外部所有权标签卷即使开启 allowLegacyUnlabeled 也拒绝纳管/删除；无标签卷仅在 allowLegacyUnlabeled=true 时兼容
    await dockerApiFetch('/volumes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Name: foreignVol,
        Labels: { 'com.docker.compose.project': 'external-stack' }
      })
    });
    await dockerApiFetch('/volumes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: unlabeledVol })
    });

    await expect(ensureSessionVolume(foreignVol, { allowLegacyUnlabeled: true })).rejects.toThrow(
      /Refusing to adopt/
    );
    await expect(deleteSessionVolume(foreignVol, { allowLegacyUnlabeled: true })).rejects.toThrow(
      /Refusing to delete/
    );
    await expect(ensureSessionVolume(unlabeledVol)).rejects.toThrow(/Refusing to adopt/);
    await expect(ensureSessionVolume(unlabeledVol, { allowLegacyUnlabeled: true })).resolves.toBe(
      unlabeledVol
    );
    await expect(deleteSessionVolume(unlabeledVol)).rejects.toThrow(/Refusing to delete/);
    await expect(
      deleteSessionVolume(unlabeledVol, { allowLegacyUnlabeled: true })
    ).resolves.toBeUndefined();

    // 3. 两阶段孤儿卷 GC：第一轮写 Redis 观察标记，宽限期内不删，过 30m 宽限期后删除
    // 显式限定 claimNames，避免共享环境中的其他会话卷被随机测试库误判回收。
    const volumeScope = { claimNames: new Set([orphanManagedVol, foreignVol]) };
    await ensureSessionVolume(orphanManagedVol);
    expect(await listSessionVolumes()).toContain(orphanManagedVol);

    const t0 = new Date();
    await reconcileOrphanSandboxVolumes({ now: t0, scope: volumeScope });
    const markerValue = await redisCacheAdapter.get(getOrphanVolumeMarkerKey(orphanManagedVol));
    expect(markerValue).toBe(String(t0.getTime()));
    expect(await listSessionVolumes()).toContain(orphanManagedVol);

    await reconcileOrphanSandboxVolumes({
      now: new Date(t0.getTime() + ORPHAN_VOLUME_GRACE_PERIOD_MS - 1000),
      scope: volumeScope
    });
    expect(await listSessionVolumes()).toContain(orphanManagedVol);

    await reconcileOrphanSandboxVolumes({
      now: new Date(t0.getTime() + ORPHAN_VOLUME_GRACE_PERIOD_MS + 1000),
      scope: volumeScope
    });
    expect(await listSessionVolumes()).not.toContain(orphanManagedVol);
    expect(
      await dockerApiFetch(`/volumes/${encodeURIComponent(foreignVol)}`).then((r) => r.status)
    ).toBe(200);

    // 4. 孤儿容器清理：制造无 Mongo 记录的受管容器，传 now + 15m 触发 reconcileOrphanSandboxResources 回收
    // 显式限定 sessionIds，避免误删共用 OpenSandbox Server 上的其他会话。
    const orphanContainerSession = `app-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
    const containerScope = { sessionIds: new Set([orphanContainerSession]) };
    const orphanClient = createRuntimeOpenSandboxClient({
      sandboxId: orphanContainerSession
    });
    cleanupTasks.push(async () => {
      await orphanClient.delete().catch(() => undefined);
      await disconnectSandbox(orphanClient);
    });
    await orphanClient.create();
    expect((await orphanClient.getInfo())?.status.state).toBe('Running');

    await reconcileOrphanSandboxResources(new Date(Date.now() + 15 * 60_000), containerScope);
    expect((await orphanClient.getInfo())?.status.state ?? 'UnExist').toBe('UnExist');
  });

  it('blocks unmigrated legacy records (409) and converges legacyDevboxPendingCleanup delete to tombstone', async () => {
    const devboxCase = await createAppQuery('legacy-devbox-gate');
    const legacyZipCase = await createAppQuery('legacy-zip-gate');
    const tombstoneCase = await createAppQuery('legacy-tombstone');
    cleanupTasks.push(
      () => cleanupAppSandbox(devboxCase.query, s3Sandbox),
      () => cleanupAppSandbox(legacyZipCase.query, s3Sandbox),
      () => cleanupAppSandbox(tombstoneCase.query, s3Sandbox)
    );

    // 1. sealosdevbox 与未迁移 .zip archived 记录应被门禁以 409/migrationInProgress 拦截
    await MongoSandboxInstance.collection.insertOne({
      provider: 'sealosdevbox',
      sandboxId: devboxCase.query.sandboxId,
      sourceType: devboxCase.query.sourceType,
      sourceId: devboxCase.query.sourceId,
      userId: devboxCase.query.userId,
      teamId: devboxCase.teamId,
      status: SandboxInstanceStatusEnum.stopped,
      createdAt: new Date(),
      lastActiveAt: new Date()
    });
    await expect(getSandboxClient(devboxCase.query)).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );

    await MongoSandboxInstance.collection.insertOne({
      provider: 'opensandbox',
      sandboxId: legacyZipCase.query.sandboxId,
      sourceType: legacyZipCase.query.sourceType,
      sourceId: legacyZipCase.query.sourceId,
      userId: legacyZipCase.query.userId,
      teamId: legacyZipCase.teamId,
      status: SandboxInstanceStatusEnum.archived,
      createdAt: new Date(),
      lastActiveAt: new Date()
    });
    await expect(getSandboxClient(legacyZipCase.query)).rejects.toThrow(
      SandboxErrEnum.agentSandboxMigrationInProgress
    );

    // 2. 带 legacyDevboxPendingCleanup: true 的活跃 OpenSandbox 普通删除应收敛为墓碑并保留指针
    const client = await getSandboxClient(tombstoneCase.query);
    await client.exec('printf tombstone > data.txt');
    await client.opensandbox.close();
    const doc = await MongoSandboxInstance.findOne({
      sandboxId: tombstoneCase.query.sandboxId
    }).lean();
    const claimName = getSessionVolumeClaimName(doc?.storage)!;
    await MongoSandboxInstance.updateOne(
      { _id: doc!._id },
      { $set: { 'storage.legacyDevboxPendingCleanup': true } }
    );
    const updatedDoc = (await MongoSandboxInstance.findOne({ _id: doc!._id }).lean())!;

    await deleteSandboxResource(updatedDoc);
    const tombstone = await MongoSandboxInstance.findOne({ _id: doc!._id }).lean();
    expect(tombstone).toMatchObject({
      provider: 'opensandbox',
      status: 'archived',
      storage: {
        archive: {
          generation: 'deleted',
          format: 'tar.zst',
          sizeBytes: 0
        },
        legacyDevboxPendingCleanup: true
      }
    });
    expect(tombstone?.storage?.volumes).toBeUndefined();
    expect(tombstone?.instanceId).toBeUndefined();
    expect(await listSessionVolumes()).not.toContain(claimName);
  });

  it('runs real RustFS S3 Skill import (.zip -> .tar.zst), edit sandbox init, .gitignore pack deploy, symlink reject, and export', async () => {
    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const zip = new JSZip();
    zip.file(
      'skills/real-demo/SKILL.md',
      '---\nname: real-demo\ndescription: Initial real skill\n---\n\n# Initial\n'
    );
    zip.file('skills/real-demo/hello.txt', 'v1-content');
    const pkgBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const skillId = await importSkill({
      skill: {
        name: `Real S3 Skill ${randomUUID()}`,
        description: 'Real RustFS S3 Skill lifecycle test',
        category: []
      },
      teamId,
      tmbId,
      packageStream: Readable.from(pkgBuffer),
      contentLength: pkgBuffer.length
    });
    const sandboxId = getEditDebugSandboxId(skillId);

    cleanupTasks.push(async () => {
      const sb = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      if (sb) await deleteSandboxResource(sb).catch(() => undefined);
      const versions = await MongoAgentSkillsVersion.find({ skillId }).lean();
      for (const v of versions) {
        await s3Skill.removeObject(v.storageKey).catch(() => undefined);
        await MongoS3TTL.deleteMany({ minioKey: v.storageKey }).catch(() => undefined);
      }
      await MongoAgentSkillsVersion.deleteMany({ skillId }).catch(() => undefined);
      await MongoAgentSkills.deleteOne({ _id: skillId }).catch(() => undefined);
    });

    const v1 = await MongoAgentSkillsVersion.findOne({ skillId }).lean();
    expect(v1?.storageKey).toMatch(/\.zip$/);
    expect(await s3Skill.isObjectExists(v1!.storageKey)).toBe(true);

    // 1. 初始化 Skill Edit sandbox，核验从 RustFS .tar.zst 解压部署到容器 /workspace
    const ctx = await getSkillEditRuntimeContext({ skillId, teamId });
    await initSkillEditRuntimeSandbox({ context: ctx });

    const skillClient = await getSandboxClient({
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: ChatSourceTypeEnum.skillEdit,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
    });
    const workDir = ctx.runtimeProfile.workDirectory;
    const [initSkillMd] = await skillClient.opensandbox.readFiles([
      joinSandboxPath(workDir, 'skills/real-demo/SKILL.md')
    ]);
    expect(Buffer.from(initSkillMd!.content).toString('utf8')).toContain('Initial real skill');

    // 2. 写入 .gitignore、忽略文件、更新 SKILL.md 并发布 v2（通过真实 IDE Agent /archive/pack -> RustFS Multipart/Upload + Mongo 事务清 TTL）
    await skillClient.opensandbox.createDirectories([
      joinSandboxPath(workDir, 'custom-ignored'),
      joinSandboxPath(workDir, 'skills/real-demo')
    ]);
    await skillClient.opensandbox.writeFiles([
      {
        path: joinSandboxPath(workDir, '.gitignore'),
        data: '*.secret\ncustom-ignored/\n'
      },
      {
        path: joinSandboxPath(workDir, 'leak.secret'),
        data: 'must-not-be-packaged'
      },
      {
        path: joinSandboxPath(workDir, 'custom-ignored/hidden.txt'),
        data: 'must-not-be-packaged'
      },
      {
        path: joinSandboxPath(workDir, 'skills/real-demo/SKILL.md'),
        data: '---\nname: real-demo\ndescription: Updated real skill v2\n---\n\n# V2\n'
      }
    ]);

    const deployRes = await saveDeploySkillFromSandbox({
      skillId,
      teamId,
      tmbId,
      versionName: 'v2-integration'
    });
    expect(deployRes.storageKey).toMatch(/\.tar\.zst$/);
    expect(await s3Skill.isObjectExists(deployRes.storageKey)).toBe(true);
    // Mongo 事务应已清理该版本包的临时 TTL
    expect(await MongoS3TTL.exists({ minioKey: deployRes.storageKey })).toBeNull();

    // 下载 RustFS 上的 v2 .tar.zst 校验内容与 .gitignore 排除规则
    const dlStream = await s3Skill.getFileStream(deployRes.storageKey);
    const deployedEntries: string[] = [];
    await parseTarZstStream({
      stream: dlStream!,
      maxTotalBytes: getAgentSandboxDiskBytes(),
      onEntry: async (entry) => {
        deployedEntries.push(entry.path);
        for await (const _chunk of entry.stream) {
          // drain
        }
      }
    });
    expect(deployedEntries).toContain('skills/real-demo/SKILL.md');
    expect(deployedEntries).not.toContain('leak.secret');
    expect(deployedEntries.some((p) => p.includes('custom-ignored'))).toBe(false);

    // 3. 工作区软链原样进入发布包（与 upstream `zip -y` 语义一致，不解析目标）
    await skillClient.exec('ln -s skills/real-demo/SKILL.md link.md');
    const symlinkDeploy = await saveDeploySkillFromSandbox({
      skillId,
      teamId,
      tmbId,
      versionName: 'v-symlink'
    });
    const symlinkEntries: Array<{ path: string; linkname?: string }> = [];
    await parseTarZstStream({
      stream: (await s3Skill.getFileStream(symlinkDeploy.storageKey))!,
      onEntry: async ({ path, linkname }) => {
        symlinkEntries.push({ path, linkname });
      }
    });
    expect(symlinkEntries).toContainEqual({
      path: 'link.md',
      linkname: 'skills/real-demo/SKILL.md'
    });
    await skillClient.exec('rm -f link.md');

    // 4. 校验实时导出流 streamSkillEditWorkspaceTarZst
    const exportedPaths: string[] = [];
    await streamSkillEditWorkspaceTarZst({
      skillId,
      teamId,
      onStreamReady: async (stream) => {
        await parseTarZstStream({
          stream,
          onEntry: async (entry) => {
            exportedPaths.push(entry.path);
            for await (const _chunk of entry.stream) {
              // drain
            }
          }
        });
      }
    });
    expect(exportedPaths).toContain('skills/real-demo/SKILL.md');
    expect(exportedPaths).not.toContain('leak.secret');
    await skillClient.opensandbox.close();

    // 5. 销毁容器与卷后，基于 v2 .tar.zst 重新初始化 Skill Edit sandbox，验证从 RustFS .tar.zst 重建还原
    const currentSb = await MongoSandboxInstance.findOne({ sandboxId }).lean();
    await deleteSandboxResource(currentSb!);
    const ctx2 = await getSkillEditRuntimeContext({ skillId, teamId });
    await initSkillEditRuntimeSandbox({ context: ctx2 });
    const rebuiltClient = await getSandboxClient({
      sandboxId,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: ChatSourceTypeEnum.skillEdit,
      chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
    });
    const [rebuiltSkillMd] = await rebuiltClient.opensandbox.readFiles([
      joinSandboxPath(workDir, 'skills/real-demo/SKILL.md')
    ]);
    expect(Buffer.from(rebuiltSkillMd!.content).toString('utf8')).toContain(
      'Updated real skill v2'
    );
    await rebuiltClient.opensandbox.close();
  });
});
