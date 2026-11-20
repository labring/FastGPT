import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import { compressZstd } from '@fastgpt/service/common/file/tarZst';
import {
  buildSandboxArchiveObjectKey,
  getS3SandboxSource
} from '@fastgpt/service/common/s3/sources/sandbox';
import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';
import { SandboxInstanceStatusEnum } from '@fastgpt/service/core/ai/sandbox/constants';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { isSandboxRecordMigrated } from '@fastgpt/service/core/ai/sandbox/legacy';
import type { SealosMigrationClient } from './sealosClient';
import {
  buildTarZstArchiveInfo,
  commitMigratedSandboxArchive,
  isSandboxSourceActive
} from './utils';
import {
  buildLegacySandboxZipKey,
  transcodeLegacyZipArchiveWithinLease,
  type SandboxMigrationDoc
} from './zipTranscoder';

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
 * 将单个存量 `sealosdevbox` 实例以 5 步静止化流程直转为 OpenSandbox `archived`（`.tar.zst`）状态。
 *
 * - 全流程在 `withSandboxLease(sandboxId)` 互斥锁内执行；
 * - 对 `running` 实例先执行 `pause` 物理断连旧会话长连接与后台写入，再 `resume` 对齐工作区打包、流式校验并压缩直传 S3；
 * - 原子 CAS 提交成功后在 `finally` 清理远端临时 tar 并 `pause` 保留原 Devbox（置 `legacyDevboxPendingCleanup`），直到独立清理任务确认回收。
 */
export async function migrateSealosDevboxInstance(params: {
  sandboxId: string;
  sealosClient: SealosMigrationClient | (() => SealosMigrationClient);
  workDirectory: string;
  signal?: AbortSignal;
}): Promise<'migrated' | 'skipped'> {
  const { sandboxId, sealosClient, workDirectory, signal } = params;

  return await withSandboxLease({
    sandboxId,
    label: `migrate-devbox:${sandboxId}`,
    signal,
    fn: async (lease) => {
      const effectiveSignal = signal ? AbortSignal.any([signal, lease.signal]) : lease.signal;
      effectiveSignal.throwIfAborted();
      const current = await MongoSandboxInstance.collection.findOne<SandboxMigrationDoc>({
        sandboxId
      });
      if (!current || isSandboxRecordMigrated(current)) {
        return 'skipped';
      }
      if (!(await isSandboxSourceActive(current))) {
        return 'skipped';
      }

      if (current.status === SandboxInstanceStatusEnum.deleting) {
        const committed = await commitMigratedSandboxArchive({
          current,
          archive: buildTarZstArchiveInfo({ sandboxId, generation: 'deleted', sizeBytes: 0 }),
          lease
        });
        return committed ? 'migrated' : 'skipped';
      }

      if (current.status === SandboxInstanceStatusEnum.archived) {
        return await transcodeLegacyZipArchiveWithinLease({
          current,
          signal: effectiveSignal,
          lease
        });
      }

      const client = typeof sealosClient === 'function' ? sealosClient() : sealosClient;
      const generation = randomUUID().replaceAll('-', '').slice(0, 12);
      const objectKey = buildSandboxArchiveObjectKey(sandboxId, generation);

      const remote = await client.getDevbox(sandboxId, effectiveSignal);
      if (!remote) {
        if (await getS3SandboxSource().isObjectExists(buildLegacySandboxZipKey(sandboxId))) {
          return await transcodeLegacyZipArchiveWithinLease({
            current,
            signal: effectiveSignal,
            lease
          });
        }
        if (current.status === SandboxInstanceStatusEnum.provisioning) {
          const committed = await commitMigratedSandboxArchive({
            current,
            archive: buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes: 0 }),
            lease
          });
          return committed ? 'migrated' : 'skipped';
        }
        throw new Error('Remote Sealos Devbox not found for unarchived sandbox instance');
      }

      // 步骤 1：若历史状态或远端仍处于 running，先强制 pause 销毁旧 Pod，物理断连残留 WS / 写盘进程。
      let currentRemote: Awaited<ReturnType<SealosMigrationClient['getDevbox']>> | undefined =
        remote;
      if (
        current.status === SandboxInstanceStatusEnum.running ||
        remote.state.phase === 'Running'
      ) {
        await client.pauseAndWaitStopped(sandboxId, {
          signal: effectiveSignal,
          initialInfo: remote
        });
        currentRemote = undefined;
      }

      // 步骤 2：拉起干净静止的工作区，等待 Pod 与 exec 通道完全就绪。
      await client.resumeAndWaitReady(sandboxId, {
        signal: effectiveSignal,
        initialInfo: currentRemote
      });

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
          "find . -mindepth 1 \\( -path './lost+found' -o -path './.fastgpt-sandbox-*' \\) -prune -o \\( ! -type s ! -type p ! -type b ! -type c ! -name '.*.fastgpt-tmp-*' -print0 \\) > \"$LISTFILE\"",
          'if [ ! -s "$LISTFILE" ]; then rm -f "$LISTFILE"; echo "EMPTY_WORKDIR"; exit 0; fi',
          // `S` 标志确保 `--transform` 不改写符号链接目标，仅把归档成员路径统一放到 `workspace/` 下。
          `tar --null --no-recursion --transform='s,^\\./,workspace/,S' -T "$LISTFILE" -cf "$TARFILE"`,
          'rm -f "$LISTFILE"',
          'TARBYTES=$(wc -c < "$TARFILE" | tr -d "[:space:]")',
          'echo "TAR_BYTES:$TARBYTES"'
        ].join('\n');

        const packResult = await client.exec(sandboxId, {
          command: ['sh', '-c', packScript],
          timeoutSeconds: 300,
          signal: effectiveSignal
        });
        if (packResult.exitCode !== 0) {
          throw new Error(
            packResult.stderr.trim() ||
              packResult.stdout.trim() ||
              `Devbox workspace tar packing failed (exit ${packResult.exitCode})`
          );
        }

        const archive = await (async () => {
          const output = packResult.stdout.trim();
          if (output.split('\n').some((line) => line.trim() === 'EMPTY_WORKDIR')) {
            return buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes: 0 });
          }

          const match = /TAR_BYTES:(\d+)/.exec(output);
          const expectedTarBytes = match ? Number.parseInt(match[1], 10) : Number.NaN;
          if (!Number.isSafeInteger(expectedTarBytes) || expectedTarBytes <= 0) {
            throw new Error(`Invalid TAR_BYTES reported by Sealos Devbox: ${output.slice(0, 120)}`);
          }

          // 步骤 4：流式下载 /tmp/.tar，校验精确总字节数后实时 zstd 压缩直传 S3。
          const rawTarStream = await client.downloadFileStream(sandboxId, {
            path: tempTarPath,
            timeoutSeconds: 600,
            signal: effectiveSignal
          });
          const { compressedBytes } = await uploadRawTarAsTarZst({
            objectKey,
            rawTarStream,
            expectedTarBytes,
            signal: effectiveSignal
          });
          return buildTarZstArchiveInfo({ sandboxId, generation, sizeBytes: compressedBytes });
        })();

        // 步骤 5：原子 CAS 提交新归档元数据并切换 provider 为 opensandbox。
        const committed = await commitMigratedSandboxArchive({ current, archive, lease });
        return committed ? 'migrated' : 'skipped';
      } finally {
        const cleanupSignal = AbortSignal.timeout(30_000);
        await client
          .exec(sandboxId, {
            command: ['rm', '-f', tempTarPath, tempListPath],
            timeoutSeconds: 30,
            signal: cleanupSignal
          })
          .catch(() => undefined);
        // 迁移后暂停并保留原 Devbox 盘作为安全回滚基线，待独立清理任务最终核验回收。
        await client
          .pauseAndWaitStopped(sandboxId, { signal: cleanupSignal })
          .catch(() => undefined);
      }
    }
  });
}
