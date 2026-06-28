/**
 * 沙盒业务层：编排 sandbox tool 调用。
 *
 * 负责工具参数校验、运行态 sandbox 准备和工具执行，不直接暴露给外部业务调用。
 */
import { sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { toolMap as editFileToolMap } from './editFile.tool';
import { toolMap as getFileUrlToolMap } from './getFileUrl.tool';
import { toolMap as readFileToolMap } from './readFile.tool';
import { toolMap as searchToolMap } from './search.tool';
import { toolMap as shellToolMap } from './shell.tool';
import { toolMap as writeFileToolMap } from './writeFile.tool';
import { getSandboxClient, type SandboxClient } from '../runtime/client';
import { parseJsonArgs } from '../../../utils';
import { writeUrlFilesToSandbox } from '../file';
import { getSandboxRuntimeProfile } from '../../infrastructure/provider/runtimeProfile';
import { preparePackageMirrors, prepareSandbox } from '../runtime/prepare';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId } from '../../utils/id';

const ToolMap = {
  ...editFileToolMap,
  ...getFileUrlToolMap,
  ...readFileToolMap,
  ...searchToolMap,
  ...writeFileToolMap,
  ...shellToolMap
};

export type SandboxToolCallResult = {
  success: boolean;
  input: Record<string, any>;
  response: string;
  durationSeconds: number;
};

/**
 * 执行一次 sandbox 工具调用。
 *
 * 这里负责解析 LLM 传入的 JSON 参数、按工具 schema 校验，并复用已有 SandboxClient；
 * 未传入 client 时会按 app/user/chat 获取运行态 sandbox。
 */
export const runSandboxTools = async ({
  sourceType,
  sourceId,
  userId,
  chatId,
  toolName,
  args,
  sandboxClient
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  toolName: string;
  args: string;
  sandboxClient?: SandboxClient;
}): Promise<SandboxToolCallResult> => {
  const startTime = Date.now();
  const getDuration = () => +((Date.now() - startTime) / 1000).toFixed(2);

  const tool = ToolMap[toolName as keyof typeof ToolMap];

  if (!tool) {
    return {
      success: false,
      input: {},
      response: `Unknown sandbox tool: ${toolName}`,
      durationSeconds: getDuration()
    };
  }

  const parsedArgs = tool.zodSchema.safeParse(parseJsonArgs(args));
  if (!parsedArgs.success) {
    return {
      success: false,
      input: {},
      response: parsedArgs.error.message,
      durationSeconds: getDuration()
    };
  }

  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });
  const instance =
    sandboxClient ??
    (await getSandboxClient(
      {
        sandboxId,
        sourceType,
        sourceId,
        userId: sourceType === ChatSourceTypeEnum.app ? userId : '',
        chatId
      },
      {
        failedArchivePolicy: 'clearAndContinue'
      }
    ));
  const result = await tool.execute({
    sourceType,
    sourceId,
    userId,
    chatId,
    sandboxInstance: instance,
    params: parsedArgs.data as any
  });

  return {
    success: true,
    input: parsedArgs.data,
    response: result.response,
    durationSeconds: getDuration()
  };
};

/**
 * 准备 ToolCall 使用的运行态 sandbox。
 *
 * 该入口会获取当前会话 sandbox client，并把本轮用户输入文件写入 provider 文件系统。
 * 即使没有文件也会返回 sandbox client，供 sandbox entrypoint 和后续工具调用复用。
 */
export const prepareSandboxToolRuntime = async ({
  sourceType,
  sourceId,
  userId,
  chatId,
  files
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  files: { path: string; url: string }[];
}) => {
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId,
    chatId
  });
  const instance = await getSandboxClient(
    {
      sandboxId,
      sourceType,
      sourceId,
      userId: sourceType === ChatSourceTypeEnum.app ? userId : '',
      chatId
    },
    {
      failedArchivePolicy: 'clearAndContinue'
    }
  );
  const runtimeProfile = getSandboxRuntimeProfile();
  await prepareSandbox(
    {
      sandbox: instance.provider,
      sandboxClient: instance,
      workDirectory: runtimeProfile.workDirectory
    },
    preparePackageMirrors()
  );
  await writeUrlFilesToSandbox(instance.provider, files);
  return instance;
};

/**
 * 获取 sandbox 工具的展示信息。
 *
 * 仅返回全局工具表中已有工具的本地化名称和描述，供 workflow/tool UI 展示使用。
 */
export const getSandboxToolInfo = (name: string, lang: localeType = LangEnum.en) => {
  if (name in sandboxToolMap) {
    const info = sandboxToolMap[name];
    return {
      name: parseI18nString(info.name, lang),
      avatar: info.avatar,
      toolDescription: info.toolDescription
    };
  }
};
