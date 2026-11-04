import {
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type {
  CheckContentByPolicyParams,
  CheckContentByPolicyResult,
  SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import { checkModerationContent } from '../../../thirdProvider/fastgptPlugin/moderation';
import { getEnabledModerationRuntime, getModerationPolicy } from './service';
import { recordModerationEvent } from './record/entity';
import { appendNodeModerationRecord } from './collector';

/**
 * 判断指定阶段的审核 Hook 是否在策略中启用
 */
export const isModerationHookEnabled = ({
  stage,
  policy
}: {
  stage: `${ModerationStageEnum}` | ModerationStageEnum;
  policy: SystemModerationPolicyType;
}): boolean => {
  if (!policy.enabled) return false;

  switch (stage) {
    case ModerationStageEnum.entry:
      return policy.hooks.userInput;
    case ModerationStageEnum.modelInput:
      return policy.hooks.modelInput;
    case ModerationStageEnum.output:
      return policy.hooks.finalOutput;
    default:
      return false;
  }
};

/**
 * 依据全局内容审核策略对文本进行审查与合规裁决判定
 *
 * 审查决策引擎的职责保持纯粹：仅负责对内容进行安全合规评估并给出 pass / block 裁决。
 * 针对违规内容（block）的具体业务动作（如直接阻断抛错，或在 Agent Loop 内部替换为脱敏提示继续规划），
 * 由调用方（各业务锚点）自行决定与处理。
 *
 * 1. 检查全局策略开关及当前阶段对应的 hook 开关，若未开启直接放行 (pass)
 * 2. 空内容或纯空白字符串直接放行 (pass)
 * 3. 获取已启用的审查插件及其解密后的凭据，未配置或异常时按 serviceExceptionAction 策略降级 (pass/block)
 * 4. 调用审查插件执行审查，根据 verdict（pass/block/suspected/error）结合策略计算最终动作（pass/block）
 * 5. 异步静默写入审核记录（不阻断业务链路）
 */
export const checkContentByPolicy = async ({
  text,
  stage,
  targetField,
  policy: inputPolicy,
  actionOnBlock = ModerationActionEnum.block,
  sessionId,
  partial,
  context
}: CheckContentByPolicyParams): Promise<CheckContentByPolicyResult> => {
  // 1. 空内容直接放行
  if (!text || text.trim() === '') {
    return {
      action: ModerationActionEnum.pass,
      isPass: true,
      text
    };
  }

  // 2. 读取策略与检查 hook 是否生效
  const policy = inputPolicy ?? (await getModerationPolicy());
  if (!isModerationHookEnabled({ stage, policy })) {
    return {
      action: ModerationActionEnum.pass,
      isPass: true,
      text
    };
  }

  const currentStage = stage as ModerationStageEnum;

  // 3. 获取当前启用的审查插件运行时
  let runtime: Awaited<ReturnType<typeof getEnabledModerationRuntime>>;
  try {
    runtime = await getEnabledModerationRuntime();
  } catch (err: any) {
    return handleServiceException({
      err,
      policy,
      text,
      stage: currentStage,
      targetField,
      actionOnBlock,
      context,
      duration: 0
    });
  }

  if (!runtime) {
    return handleServiceException({
      err: new Error('No active moderation plugin configured'),
      policy,
      text,
      stage: currentStage,
      targetField,
      actionOnBlock,
      context,
      duration: 0
    });
  }

  // 4. 调用审查插件
  const startTime = Date.now();
  try {
    const moderationResult = await checkModerationContent({
      pluginId: runtime.pluginId,
      version: runtime.version,
      source: runtime.source,
      secrets: runtime.secrets,
      systemVar: {
        app: { id: context?.appId || '', name: '' },
        chat: { chatId: context?.chatId || '' },
        invokeToken: '',
        time: new Date().toISOString()
      },
      input: {
        content: text,
        ...(sessionId ? { sessionId } : {}),
        ...(partial !== undefined ? { partial } : {})
      }
    });

    const duration = Date.now() - startTime;

    // 5. 依据裁决结果与策略判定最终动作（pass / block / replace）
    let action: ModerationActionEnum;
    switch (moderationResult.verdict) {
      case 'pass':
        action = ModerationActionEnum.pass;
        break;
      case 'block':
        action = actionOnBlock;
        break;
      case 'suspected':
        action =
          policy.strategy.suspectedRiskAction === ModerationRiskActionEnum.passAndLog
            ? ModerationActionEnum.pass
            : actionOnBlock;
        break;
      case 'error':
        action =
          policy.strategy.serviceExceptionAction === ModerationExceptionActionEnum.pass
            ? ModerationActionEnum.pass
            : actionOnBlock;
        break;
      default:
        action = actionOnBlock;
        break;
    }

    // 提取敏感词
    const keywords = Array.from(
      new Set([
        ...(moderationResult.keywords || []),
        ...(moderationResult.hits?.flatMap((h) => h.keywords || []) || [])
      ])
    );

    // 6. 异步静默写入审核记录
    recordModerationEvent({
      teamId: context?.teamId,
      tmbId: context?.tmbId,
      appId: context?.appId,
      chatId: context?.chatId,
      responseChatItemId: context?.responseChatItemId,
      requestId: context?.requestId,
      stage: currentStage,
      nodeId: context?.nodeId,
      nodeName: context?.nodeName,
      targetField,
      content: text,
      pluginId: runtime.pluginId,
      provider: moderationResult.provider,
      verdict: moderationResult.verdict,
      hits: moderationResult.hits,
      keywords,
      errorMessage: moderationResult.errorMessage,
      actionTaken: action,
      duration
    }).catch(() => {});

    const result: CheckContentByPolicyResult = {
      action,
      isPass: action === ModerationActionEnum.pass,
      text,
      verdict: moderationResult.verdict,
      hits: moderationResult.hits,
      keywords,
      errorMessage: moderationResult.errorMessage,
      duration,
      pluginId: runtime.pluginId,
      provider: moderationResult.provider
    };

    if (action !== ModerationActionEnum.pass) {
      appendNodeModerationRecord(
        {
          stage: currentStage,
          targetField,
          verdict: moderationResult.verdict,
          actionTaken: action,
          hits: moderationResult.hits ?? [],
          keywords,
          content: text,
          errorMessage: moderationResult.errorMessage
        },
        result
      );
    }

    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    return handleServiceException({
      err,
      policy,
      text,
      stage: currentStage,
      targetField,
      actionOnBlock,
      context,
      duration,
      pluginId: runtime.pluginId
    });
  }
};

/**
 * 内部异常处理辅助函数
 */
const handleServiceException = ({
  err,
  policy,
  text,
  stage,
  targetField,
  actionOnBlock = ModerationActionEnum.block,
  context,
  duration,
  pluginId
}: {
  err: any;
  policy: SystemModerationPolicyType;
  text: string;
  stage: ModerationStageEnum;
  targetField?: string;
  actionOnBlock?: ModerationActionEnum.block | ModerationActionEnum.replace;
  context?: CheckContentByPolicyParams['context'];
  duration?: number;
  pluginId?: string;
}): CheckContentByPolicyResult => {
  const errorMessage = err?.message || String(err);
  const action =
    policy.strategy.serviceExceptionAction === ModerationExceptionActionEnum.pass
      ? ModerationActionEnum.pass
      : actionOnBlock;

  recordModerationEvent({
    teamId: context?.teamId,
    tmbId: context?.tmbId,
    appId: context?.appId,
    chatId: context?.chatId,
    responseChatItemId: context?.responseChatItemId,
    requestId: context?.requestId,
    stage,
    nodeId: context?.nodeId,
    nodeName: context?.nodeName,
    targetField,
    content: text,
    pluginId,
    provider: 'unknown',
    verdict: 'error',
    keywords: [],
    hits: [],
    errorMessage,
    actionTaken: action,
    duration
  }).catch(() => {});

  const result: CheckContentByPolicyResult = {
    action,
    isPass: action === ModerationActionEnum.pass,
    text,
    verdict: 'error',
    errorMessage,
    duration,
    pluginId
  };

  if (action !== ModerationActionEnum.pass) {
    appendNodeModerationRecord(
      {
        stage,
        targetField,
        verdict: 'error',
        actionTaken: action,
        hits: [],
        keywords: [],
        content: text,
        errorMessage
      },
      result
    );
  }

  return result;
};
