/**
 * 沙盒模块错误工厂。
 *
 * 统一把 sandbox 业务错误转换成 UserError，不承载 provider 或数据库逻辑。
 */
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';

/** 表示 keepalive 等禁止创建的路径没有可继续使用的 running sandbox。 */
export class SandboxRuntimeNotRunningError extends Error {
  constructor(readonly sandboxId: string) {
    super('Sandbox runtime instance is not running');
    this.name = 'SandboxRuntimeNotRunningError';
  }
}

/**
 * 生成 Agent 虚拟机权限错误。
 *
 * 该错误表示团队套餐或管理员配置不允许当前应用使用虚拟机，属于业务权限拒绝，
 * 需要和 provider 内部文件权限、命令权限等通用 PERMISSION_DENIED 区分。
 */
export const createAgentSandboxPermissionDeniedError = () =>
  new UserError(SandboxErrEnum.agentSandboxPermissionDenied);

/**
 * 生成 Agent 虚拟机运行态初始化占用错误。
 *
 * 该错误表示同一个 sandbox 正在执行文件/skill/entrypoint reconcile。本轮不能无锁继续，
 * 否则可能重新引入 skill 目录清理与扫描交错问题。
 */
export const createAgentSandboxInitializingError = () =>
  new UserError(SandboxErrEnum.agentSandboxInitializing);

/** 将底层迁移异常转换为可展示且经过敏感信息替换的用户错误。 */
export const createSandboxRuntimeUpgradeFailedError = (error: unknown) =>
  new UserError(getErrText(error, SandboxErrEnum.runtimeUpgradeFailed));

/**
 * 生成沙箱活跃实例系统总上限拒绝错误。
 *
 * 表示平台级 Quota 已满（app 会话与技能编辑共用计数池），需要等待其他沙箱停止/归档后重试。
 */
export const createAgentSandboxLimitReachedError = () =>
  new UserError(SandboxErrEnum.agentSandboxLimitReached);

/** 生成团队沙箱配额拒绝错误：当前团队的活跃沙箱实例已达配额上限。 */
export const createAgentSandboxTeamLimitReachedError = () =>
  new UserError(SandboxErrEnum.agentSandboxTeamLimitReached);

/**
 * 判定“远端已明确结束”的沙箱失败（容器非 0 退出、配额拒绝等）。
 *
 * provider 的真实终止原因常被通用 ConnectionError 包在 cause 里，只读外层 message
 * 会丢掉证据。这里优先读取适配器边界保留的结构化 code，其次才回退到文本特征；
 * 只有“可靠终止证据”才返回 true，超时/网络错误等未知结果必须保持 false。
 * 这类失败不是执行者失联导致的未知结果，重试语义明确，不需要再等操作隔离窗口；
 * 若仍按隔离窗口（provision 5 分钟）阻塞，会在用户侧表现为
 * “沙箱启动失败后一段时间内怎么点都失败、过一会儿又突然好了”。
 */
const SETTLED_SANDBOX_FAILURE_PATTERNS: ReadonlyArray<{ code: string; pattern: string }> = [
  { code: 'KUBERNETES::POD_FAILED', pattern: 'KUBERNETES::POD_FAILED' },
  { code: 'KUBERNETES::QUOTA_EXCEEDED', pattern: 'KUBERNETES::QUOTA_EXCEEDED' },
  { code: 'CONTAINER_FAILED', pattern: 'primary reason=ContainerFailed' },
  { code: 'INIT_CONTAINER_FAILED', pattern: 'primary reason=InitContainerFailed' },
  { code: 'CONTAINER_EXITED', pattern: 'container sandbox exited with code' }
];

/** 结构化终止码集合；历史 operation 记录没有 errorCode 时仍需文本匹配。 */
export const SANDBOX_TERMINATION_ERROR_CODES: ReadonlySet<string> = new Set(
  SETTLED_SANDBOX_FAILURE_PATTERNS.map(({ code }) => code)
);

type SandboxFailureEvidence = { code: string; detail?: string };

type CollectedFailureEvidence = {
  codes: string[];
  names: string[];
  texts: string[];
};

/**
 * 沿 cause/AggregateError/SDK error 字段收集结构化 code 与文本。
 *
 * 兼容 Error.cause 嵌套、AggregateError.errors、SDK SandboxException.error
 * 以及普通对象 { code, message } 四种形态。
 */
const collectFailureEvidence = (
  value: unknown,
  evidence: CollectedFailureEvidence,
  seen = new Set<unknown>(),
  depth = 0
): void => {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    evidence.texts.push(value);
    return;
  }
  if (typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (typeof record.name === 'string') evidence.names.push(record.name);
  if (typeof record.code === 'string') evidence.codes.push(record.code);
  for (const key of ['message', 'detail', 'reason', 'errorText', 'system_error_text']) {
    const text = record[key];
    if (typeof text === 'string') evidence.texts.push(text);
  }

  collectFailureEvidence(record.error, evidence, seen, depth + 1);
  if (Array.isArray(record.errors)) {
    for (const nested of record.errors) {
      collectFailureEvidence(nested, evidence, seen, depth + 1);
    }
  }
  collectFailureEvidence(record.status, evidence, seen, depth + 1);
  collectFailureEvidence(record.cause, evidence, seen, depth + 1);
};

/** 查找可靠终止证据：结构化 code 优先，其次才做文本匹配。 */
const findSettledSandboxFailure = (error: unknown): SandboxFailureEvidence | undefined => {
  const evidence: CollectedFailureEvidence = { codes: [], names: [], texts: [] };
  collectFailureEvidence(error, evidence);

  // 适配器边界显式标注的终止异常本身就是可靠证据。
  if (evidence.names.includes('SandboxTerminationError')) {
    const code = evidence.codes.find((value) => value !== 'CONNECTION_ERROR');
    if (code) {
      const detail = evidence.texts.find((text) =>
        SETTLED_SANDBOX_FAILURE_PATTERNS.some(({ pattern }) => text.includes(pattern))
      );
      return { code, detail };
    }
  }

  for (const { code, pattern } of SETTLED_SANDBOX_FAILURE_PATTERNS) {
    if (evidence.codes.some((value) => value.includes(pattern))) {
      return { code, detail: evidence.texts.find((text) => text.includes(pattern)) };
    }
  }

  // getErrText 覆盖响应体等非 cause 协议字段，作为最后的文本回退。
  const outerText = getErrText(error, '');
  const texts = [...evidence.texts, outerText];
  for (const { code, pattern } of SETTLED_SANDBOX_FAILURE_PATTERNS) {
    const detail = texts.find((text) => text.includes(pattern));
    if (detail !== undefined) return { code, detail };
  }
  return undefined;
};

/** 仅“可靠终止证据”返回 true；超时、网络错误等未知结果返回 false。 */
export const isSettledSandboxFailure = (error: unknown): boolean =>
  Boolean(findSettledSandboxFailure(error));

/** 提取可持久化的结构化终止码；没有可靠证据时返回 undefined。 */
export const getSandboxFailureCode = (error: unknown): string | undefined =>
  findSettledSandboxFailure(error)?.code;

/** 判断持久化的 errorCode 是否属于可靠终止码（历史记录文本回退另行处理）。 */
export const isSettledSandboxFailureCode = (code?: string): boolean =>
  Boolean(code && SANDBOX_TERMINATION_ERROR_CODES.has(code));
