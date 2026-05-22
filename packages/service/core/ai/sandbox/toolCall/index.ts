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
import { getSandboxClient, type SandboxClient } from '../service/runtime';
import { parseJsonArgs } from '../../utils';
import { writeUrlFilesToSandbox } from '../service/file';

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
  appId,
  userId,
  chatId,
  toolName,
  args,
  sandboxClient
}: {
  appId: string;
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

  const instance = sandboxClient ?? (await getSandboxClient({ appId, userId, chatId }));
  const result = await tool.execute({
    appId,
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
 * 将用户输入文件注入到当前会话 sandbox。
 *
 * 该入口会确保运行态 sandbox 可用，然后把远端 URL 文件下载并写入 provider 文件系统。
 */
export const injectSandboxFiles = async ({
  appId,
  userId,
  chatId,
  files
}: {
  appId: string;
  userId: string;
  chatId: string;
  files: { path: string; url: string }[];
}) => {
  const instance = await getSandboxClient({ appId, userId, chatId });
  await instance.ensureAvailable();
  await writeUrlFilesToSandbox(instance.provider, files);
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
