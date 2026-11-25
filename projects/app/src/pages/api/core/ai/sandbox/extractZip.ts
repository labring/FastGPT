import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { getAuthorizedSandboxClient } from '@/service/core/sandbox/runtime';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { shellQuote } from '@fastgpt/global/common/string/utils';
import {
  SandboxExtractZipBodySchema,
  SandboxExtractZipResponseSchema,
  type SandboxExtractZipBody,
  type SandboxExtractZipResponse
} from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { getSandboxDiskQuotaStatus } from '@fastgpt/service/core/ai/sandbox/application/quota';
import { createAgentSandboxDiskQuotaExceededError } from '@fastgpt/service/core/ai/sandbox/error';

const EXTRACT_ZIP_TIMEOUT_MS = 30_000;

/**
 * 在当前 Chat 会话目录下通过 OpenSandbox `execd` 解压 `.zip` 到不冲突的同名目录。
 */
async function handler(
  req: ApiRequestProps<SandboxExtractZipBody>
): Promise<SandboxExtractZipResponse> {
  const { customUid, authProxy, sourceType, sourceId, chatId, path, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: SandboxExtractZipBodySchema
    }).body;

  const segments = path.split('/');
  const zipRelPath = `./${path}`;
  const parentRelPath = segments.length > 1 ? `./${segments.slice(0, -1).join('/')}` : '.';
  const baseDirName = segments[segments.length - 1].slice(0, -4);

  const { sandbox } = await getAuthorizedSandboxClient({
    customUid,
    authProxy,
    req,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    per: WritePermissionVal
  });
  const { sessionWorkDirectory } = sandbox.getRuntimePaths();
  // 在 runWithRecovery 内探测配额并按需启用 prlimit --fsize，避免陈旧句柄触发虚假放行及 zip bomb 写爆卷。
  const result = await sandbox.runWithRecovery(async () => {
    const quota = await getSandboxDiskQuotaStatus(sandbox.opensandbox, {
      rethrowRecoverable: true
    });
    if (quota.exceeded) {
      throw createAgentSandboxDiskQuotaExceededError();
    }
    const unzipCmd =
      quota.enabled && quota.limitBytes > 0
        ? `prlimit --fsize=${quota.limitBytes}:${quota.limitBytes} -- unzip -oq "$zip_path" -d "$target_dir" </dev/null`
        : 'unzip -oq "$zip_path" -d "$target_dir" </dev/null';
    // 直接调用镜像内 `unzip`：解压发生在用户隔离的沙盒实例中。
    const script = [
      `zip_path=${shellQuote(zipRelPath)}`,
      `parent_dir=${shellQuote(parentRelPath)}`,
      `base_name=${shellQuote(baseDirName)}`,
      '[ -f "$zip_path" ] || { echo "Zip file not found: $zip_path" >&2; exit 1; }',
      'target_dir="$parent_dir/$base_name"',
      'index=1',
      // 以单级 mkdir 原子占有目标目录，避免并发解压选到同一路径时相互覆盖或误删；非冲突失败保留错误输出。
      'while ! mkdir_err=$(mkdir "$target_dir" 2>&1); do',
      '  if [ ! -e "$target_dir" ] && [ ! -L "$target_dir" ]; then',
      '    printf "%s\\n" "$mkdir_err" >&2',
      '    exit 1',
      '  fi',
      '  target_dir="$parent_dir/$base_name-$index"',
      '  index=$((index + 1))',
      'done',
      unzipCmd,
      'status=$?',
      'if [ "$status" -ne 0 ]; then',
      '  rm -rf "$target_dir"',
      '  exit "$status"',
      'fi',
      'printf "%s\\n" "${target_dir#./}"'
    ].join('\n');

    return sandbox.opensandbox.execute(script, {
      workingDirectory: sessionWorkDirectory,
      timeoutMs: EXTRACT_ZIP_TIMEOUT_MS
    });
  });

  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n');
    // 仅认 Info-ZIP 退出码 50（PK_DISK）、prlimit SIGXFSZ 153，以及 mkdir 冒号后缀或 Info-ZIP 独立行中的 OS 磁盘满诊断，避免文件名误判。
    if (
      result.exitCode === 50 ||
      result.exitCode === 153 ||
      /(?:^|:)\s*(?:no space left on device|disk quota exceeded)\s*$/im.test(output)
    ) {
      throw createAgentSandboxDiskQuotaExceededError();
    }
    throw new UserError(SkillErrEnum.archiveExtractionFailed, detail || undefined);
  }

  const targetDirPath =
    result.stdout
      .replace(/\r?\n$/, '')
      .split(/\r?\n/)
      .at(-1) ?? '';
  if (!targetDirPath) {
    throw new UserError(
      SkillErrEnum.archiveExtractionFailed,
      'Failed to resolve extracted target directory path'
    );
  }

  return SandboxExtractZipResponseSchema.parse({ targetDirPath });
}

export default NextAPI(handler);
