/**
 * 沙盒接口层：提供通用运行态 sandbox 入口。
 *
 * 本文件只暴露业务可调用的 runtime client 与 Agent runtime 准备能力；具体恢复、
 * 创建和 provider 控制流程仍由沙盒内部业务层承接。
 */
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { EDIT_DEBUG_SANDBOX_CHAT_ID } from '../../skill/edit/config';
import { getRunningSandboxId } from '../utils/id';
import type { SandboxClient, SandboxClientQuery } from '../application/runtime/client';
import type { BuiltinSkillSource } from '@fastgpt/global/core/ai/skill/runtime/builtin';
import type { SandboxPrepareContext } from '../application/runtime/prepare';
import { resolveSandboxHome } from '../application/runtime/home';
import { getBuiltinSkillsRootPath, syncBuiltinSkillsToSandbox } from '../application/runtime/skill';

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

export type AgentSandboxPrepareContext = SandboxPrepareContext & {
  sandboxClient: SandboxClient;
  skillScanDirectories: string[];
};

export type AgentSandboxPrepareAction = (
  context: AgentSandboxPrepareContext
) => Promise<AgentSandboxPrepareContext>;

/**
 * 创建“同步内置 Skill 到当前 sandbox”的 prepare action。
 *
 * 调用方只提供内置 Skill 文件来源；具体同步位置、HOME 解析和后续扫描目录登记
 * 都在 sandbox prepare 生命周期内完成，避免 API 层感知 sandbox 细节。
 */
export const createBuiltinSkillPrepareAction =
  ({
    getSources,
    injectToSandbox = syncBuiltinSkillsToSandbox
  }: {
    getSources: () => Promise<BuiltinSkillSource[]>;
    injectToSandbox?: typeof syncBuiltinSkillsToSandbox;
  }): AgentSandboxPrepareAction =>
  async (context) => {
    const sources = await getSources();
    if (sources.length === 0) return context;

    const homeDirectory = await resolveSandboxHome(context.sandbox);
    if (!homeDirectory) {
      throw new Error('Failed to resolve sandbox HOME for builtin skill sync');
    }

    await injectToSandbox({
      sandbox: context.sandbox,
      homeDirectory,
      sources
    });

    const builtinSkillsRootPath = getBuiltinSkillsRootPath(homeDirectory);

    return {
      ...context,
      skillScanDirectories: [
        ...context.skillScanDirectories,
        ...sources.map((source) => `${builtinSkillsRootPath}/${source.name}`)
      ]
    };
  };

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

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox runtime');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
}
