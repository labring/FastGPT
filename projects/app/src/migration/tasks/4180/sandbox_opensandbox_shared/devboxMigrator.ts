import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import type { RedisLeaseContext } from '@fastgpt/dal/redis/caches';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { compressZstd } from '@fastgpt/service/common/file/tarZst';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { LEGACY_DELETED_ARCHIVE_GENERATION } from '@fastgpt/service/core/ai/sandbox/legacy';
import type { SealosMigrationClient } from './sealosClient';
import {
  buildTarZstArchiveInfo,
  commitMigratedSandboxArchive,
  type SandboxMigrationDoc
} from './utils';
import { buildLegacySandboxZipKey, transcodeLegacyZipArchiveWithinLease } from './zipTranscoder';

const logger = getLogger(LogCategories.SYSTEM.UPGRADE);
const DEVBOX_CLEANUP_COMMAND_TIMEOUT_MS = 30_000;
const DEVBOX_PAUSE_CLEANUP_TIMEOUT_MS = 120_000;

/**
 * 将远端 Devbox 下载的原始 `.tar` HTTP 流经精确字节数校验后，在宿主侧实时压缩并上传至 S3 `.tar.zst`。
 *
 * 在 `Transform.flush()` 阶段强制校验 `receivedBytes === expectedTarBytes` 后才放行 zstd flush，防止断流半包写入 S3。
 */
async function uploadRawTarAsTarZst(params: {
  objectKey: string;
  rawTarStream: Readable;
  expectedTarBytes: number;
  signal?: AbortSignal;
}): Promise<{ compressedBytes: number }> {
  let receivedBytes = 0;
  const tarSizeVerifier = new Transform({
    transform(chunk, _encoding, callback) {
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > params.expectedTarBytes) {
        callback(
          new Error(
            `Downloaded tar stream exceeded expected size (${receivedBytes} > ${params.expectedTarBytes})`
          )
        );
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      if (receivedBytes !== params.expectedTarBytes) {
        callback(
          new Error(
            `Downloaded tar stream truncated (${receivedBytes} !== ${params.expectedTarBytes})`
          )
        );
        return;
      }
      callback();
    }
  });

  const body = compressZstd(params.rawTarStream, tarSizeVerifier);
  const { sizeBytes } = await getS3SandboxSource().uploadArchiveStream({
    key: params.objectKey,
    body,
    signal: params.signal
  });

  return { compressedBytes: sizeBytes };
}

/**
 * 在已持有的 `withSandboxLease` 锁内，将单个存量 `sealosdevbox` 实例以静止化流程直转为 OpenSandbox `archived`（`.tar.zst`）状态。
 *
 * - 对 `restoring` 或已过上传阶段的归档直接转码权威 S3 `package.zip`，避免打包半恢复的远端 Devbox；
 * - 对 `running` / `stopped` / `stopping` 实例缺失远端 Devbox 时直接报错阻断，不静默回退过期 `package.zip`；
 * - 对 `running` 实例先执行 `pause` 物理断连旧会话长连接与后台写入，再 `resume` 对齐工作区打包、流式校验并压缩直传 S3；
 * - 原子 CAS 提交成功后在 `finally` 清理远端临时 tar 并 `pause` 保留原 Devbox（置 `legacyDevboxPendingCleanup`）。
 */
export async function migrateSealosDevboxWithinLease(params: {
  current: SandboxMigrationDoc;
  sealosClient?: SealosMigrationClient;
  workDirectory: string;
  signal: AbortSignal;
  lease: RedisLeaseContext;
}): Promise<'migrated' | 'skipped'> {
  const { current, sealosClient, workDirectory, signal, lease } = params;
  signal.throwIfAborted();

  const sandboxId = current.sandboxId;

  if (current.status === SandboxInstanceStatusEnum.deleting) {
    const committed = await commitMigratedSandboxArchive({
      current,
      archive: buildTarZstArchiveInfo({
        sandboxId,
        generation: LEGACY_DELETED_ARCHIVE_GENERATION,
        sizeBytes: 0
      }),
      lease,
      signal
    });
    return committed ? 'migrated' : 'skipped';
  }

  if (!sealosClient) {
    throw new Error(
      'Missing AGENT_SANDBOX_SEALOS_BASEURL or AGENT_SANDBOX_SEALOS_TOKEN for active Sealos Devbox migration'
    );
  }

  const generation = randomUUID().replaceAll('-', '').slice(0, 12);
  const objectKey = buildSandboxArchiveObjectKey(sandboxId, generation);

  const remote = await sealosClient.getDevbox(sandboxId, signal);
  if (!remote) {
    if (current.status === SandboxInstanceStatusEnum.provisioning) {
      if (await getS3SandboxSource().isObjectExists(buildLegacySandboxZipKey(sandboxId))) {
        return await transcodeLegacyZipArchiveWithinLease({ current, signal, lease });
      }
      const committed = await commitMigratedSandboxArchive({
        current,
        archive: buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes: 0 }),
        lease,
        signal
      });
      return committed ? 'migrated' : 'skipped';
    }
    // running / stopped / stopping 缺少远端 Devbox 时严禁静默回退陈旧 package.zip。
    throw new Error('Remote Sealos Devbox not found for unarchived sandbox instance');
  }

  // 步骤 1：若历史状态或远端仍处于 running，先强制 pause 销毁旧 Pod，物理断连残留 WS / 写盘进程。
  if (current.status === SandboxInstanceStatusEnum.running || remote.state.phase === 'Running') {
    await sealosClient.pauseAndWaitStopped(sandboxId, signal);
  }

  // 步骤 2：拉起干净静止的工作区，等待 Pod 与 exec 通道完全就绪。
  await sealosClient.resumeAndWaitReady(sandboxId, signal);

  const tempTarPath = `/tmp/.fastgpt-migrate-${generation}.tar`;
  const tempListPath = `/tmp/.fastgpt-migrate-${generation}.list`;
  const quotedWorkDir = shellQuote(workDirectory);
  const quotedTempTar = shellQuote(tempTarPath);
  const quotedListFile = shellQuote(tempListPath);

  try {
    // 步骤 3：在 $workDirectory 内按相对路径单遍扫盘打包非特殊节点文件（保留软链和依赖缓存，统一写入 workspace/ 前缀对齐 /home/sandbox/workspace 布局）。
    const packScript = [
      'set -e',
      `WORKDIR=${quotedWorkDir}`,
      `TARFILE=${quotedTempTar}`,
      `LISTFILE=${quotedListFile}`,
      'if [ ! -d "$WORKDIR" ]; then echo "EMPTY_WORKDIR"; exit 0; fi',
      'cd "$WORKDIR"',
      'rm -f "$TARFILE" "$LISTFILE"',
      "find . -mindepth 1 \\( -path './lost+found' -o -path './.fastgpt-sandbox-*' -o -name '.*.fastgpt-tmp-*' \\) -prune -o \\( ! -type s ! -type p ! -type b ! -type c -print0 \\) > \"$LISTFILE\"",
      'if [ ! -s "$LISTFILE" ]; then rm -f "$LISTFILE"; echo "EMPTY_WORKDIR"; exit 0; fi',
      // `S` 标志确保 `--transform` 不改写符号链接目标，仅把归档成员路径统一放到 `workspace/` 下。
      `tar --null --no-recursion --transform='s,^\\./,workspace/,S' -T "$LISTFILE" -cf "$TARFILE"`,
      'rm -f "$LISTFILE"',
      'TARBYTES=$(wc -c < "$TARFILE" | tr -d "[:space:]")',
      'echo "TAR_BYTES:$TARBYTES"'
    ].join('\n');

    const packResult = await sealosClient.exec(sandboxId, {
      command: ['sh', '-c', packScript],
      timeoutSeconds: 300,
      signal
    });
    if (packResult.exitCode !== 0) {
      throw new Error(
        packResult.stderr.trim() ||
          packResult.stdout.trim() ||
          `Devbox workspace tar packing failed (exit ${packResult.exitCode})`
      );
    }

    let archiveSizeBytes = 0;
    const output = packResult.stdout.trim();
    if (!output.split('\n').some((line) => line.trim() === 'EMPTY_WORKDIR')) {
      const match = /TAR_BYTES:(\d+)/.exec(output);
      const expectedTarBytes = match ? Number.parseInt(match[1], 10) : Number.NaN;
      if (!Number.isSafeInteger(expectedTarBytes) || expectedTarBytes <= 0) {
        throw new Error(`Invalid TAR_BYTES reported by Sealos Devbox: ${output.slice(0, 120)}`);
      }

      // 步骤 4：流式下载 /tmp/.tar，校验精确总字节数后实时 zstd 压缩直传 S3。
      const rawTarStream = await sealosClient.downloadFileStream(sandboxId, {
        path: tempTarPath,
        timeoutSeconds: 600,
        signal
      });
      const { compressedBytes } = await uploadRawTarAsTarZst({
        objectKey,
        rawTarStream,
        expectedTarBytes,
        signal
      });
      archiveSizeBytes = compressedBytes;
    }

    // 步骤 5：原子 CAS 提交新归档元数据并切换 provider 为 opensandbox。
    const committed = await commitMigratedSandboxArchive({
      current,
      archive: buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes: archiveSizeBytes }),
      lease,
      signal
    });
    return committed ? 'migrated' : 'skipped';
  } finally {
    try {
      await sealosClient.exec(sandboxId, {
        command: ['rm', '-f', tempTarPath, tempListPath],
        timeoutSeconds: 30,
        signal: AbortSignal.timeout(DEVBOX_CLEANUP_COMMAND_TIMEOUT_MS)
      });
    } catch (error) {
      logger.warn('Best-effort temporary migration tar cleanup on Sealos Devbox failed', {
        sandboxId,
        error
      });
    }
    // 迁移后暂停并保留原 Devbox 盘作为安全回滚基线，待独立清理任务最终核验回收；使用独立超时避免被 rm 命令拖累。
    try {
      await sealosClient.pauseAndWaitStopped(
        sandboxId,
        AbortSignal.timeout(DEVBOX_PAUSE_CLEANUP_TIMEOUT_MS)
      );
    } catch (error) {
      logger.warn('Best-effort Sealos Devbox pause after migration failed', {
        sandboxId,
        error
      });
    }
  }
}
