/**
 * 沙盒接口层：提供通用运行态 sandbox 入口。
 *
 * 本文件只暴露业务可调用的 runtime client 与 Agent runtime 准备能力；具体恢复、
 * 创建和 provider 控制流程仍由沙盒内部业务层承接。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../skill/edit/config';
import { getRunningSandboxId } from '../utils/id';
import type { SandboxClientQuery } from '../application/runtime/client';

export {
  checkSandboxRuntimeInstanceExists,
  getSandboxClient,
  SandboxClient
} from '../application/runtime/client';
export {
  createAgentSandboxInitializingError,
  createAgentSandboxPermissionDeniedError
} from '../error';
export type { SandboxClientQuery } from '../application/runtime/client';
export { prepareAgentSandboxRuntime } from '../application/runtime';
export type { AgentSandboxRuntimeContext } from '../application/runtime';
export { getRunningSandboxId } from '../utils/id';
export { getSandboxRuntimeProfile } from '../application/runtime';
export type { SandboxRuntimeProfile } from '../application/runtime';
export {
  runAgentSandboxEntrypoint,
  runSandboxEntrypoint,
  withAgentSandboxInitLease
} from '../application/runtime/entrypoint';
export {
  injectCurrentInputFiles,
  preparePackageMirrors,
  prepareSandbox,
  readCurrentWorkingDirectory
} from '../application/runtime/prepare';
export type { SandboxPrepareContext, SandboxPrepareStep } from '../application/runtime/prepare';
export { resolveSandboxHome } from '../application/runtime/home';
export { getSafeSandboxInputFilename, joinSandboxPath } from '../utils';
export type { DeployedSkillInfo, DeployedSkillVersion } from '../application/runtime/skill';
export {
  getAgentSkillInfos,
  getBuiltinSkillsRootPath,
  injectAgentSkillFilesToSandbox,
  runAgentSkillVersionEntrypoints,
  syncBuiltinSkillsToSandbox
} from '../application/runtime/skill';

type SandboxClientQueryWithId = SandboxClientQuery & { sandboxId: string };

/**
 * 将标准 chat source 映射为 sandbox runtime client 的物理寻址参数。
 *
 * sandbox runtime 只接收标准 source；App/Skill 的权限语义留在鉴权层处理。
 */
export function buildSandboxClientQueryFromChatSource({
  sourceType,
  sourceId,
  userId,
  chatId
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
}): SandboxClientQueryWithId {
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });

  if (sourceType === ChatSourceTypeEnum.app) {
    return {
      sandboxId,
      sourceType,
      sourceId,
      userId,
      chatId
    };
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    if (chatId !== EDIT_DEBUG_SANDBOX_CHAT_ID) {
      throw new Error('Skill edit sandbox only supports edit-debug chat');
    }

    return {
      sandboxId,
      sourceType,
      sourceId,
      userId: '',
      chatId
    };
  }

  if (sourceType === ChatSourceTypeEnum.helperBot) {
    throw new Error('HelperBot source does not support sandbox runtime');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}
