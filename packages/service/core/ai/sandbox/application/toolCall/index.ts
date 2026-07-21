/**
 * 沙盒业务层：编排 sandbox tool 调用。
 *
 * 负责工具参数校验、运行态 sandbox 准备和工具执行，不直接暴露给外部业务调用。
 */
import {
  SANDBOX_EDIT_FILE_TOOL_NAME,
  SANDBOX_FIND_TOOL_NAME,
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_GREP_TOOL_NAME,
  SANDBOX_LS_TOOL_NAME,
  SANDBOX_READ_FILE_TOOL_NAME,
  SANDBOX_SHELL_TOOL_NAME,
  SANDBOX_WRITE_FILE_TOOL_NAME,
  sandboxToolMap
} from '@fastgpt/global/core/ai/sandbox/tools';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { sandboxEditFileTool } from './editFile.tool';
import { sandboxFindTool } from './find.tool';
import { sandboxGetFileUrlTool } from './getFileUrl.tool';
import { sandboxGrepTool } from './grep.tool';
import { sandboxLsTool } from './ls.tool';
import { sandboxReadFileTool } from './readFile.tool';
import { sandboxShellTool } from './shell.tool';
import { sandboxWriteFileTool } from './writeFile.tool';
import { getSandboxClient, type SandboxClient } from '../runtime/client';
import { parseJsonArgs } from '../../../utils';
import { writeUrlFilesToSandbox } from '../file';
import { preparePackageMirrors, prepareSandbox } from '../runtime/prepare';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getRunningSandboxId, getSandboxUserId } from '../../utils/id';
import type { SandboxFileRef } from '@fastgpt/global/core/ai/sandbox/type';

const ToolMap = {
  [SANDBOX_EDIT_FILE_TOOL_NAME]: sandboxEditFileTool,
  [SANDBOX_FIND_TOOL_NAME]: sandboxFindTool,
  [SANDBOX_GET_FILE_URL_TOOL_NAME]: sandboxGetFileUrlTool,
  [SANDBOX_GREP_TOOL_NAME]: sandboxGrepTool,
  [SANDBOX_LS_TOOL_NAME]: sandboxLsTool,
  [SANDBOX_READ_FILE_TOOL_NAME]: sandboxReadFileTool,
  [SANDBOX_SHELL_TOOL_NAME]: sandboxShellTool,
  [SANDBOX_WRITE_FILE_TOOL_NAME]: sandboxWriteFileTool
};

export type SandboxToolCallResult = {
  success: boolean;
  input: Record<string, any>;
  response: string;
  fileRefs?: SandboxFileRef[];
  durationSeconds: number;
};

/**
 * 执行一次 sandbox 工具调用。
 *
 * 这里负责解析 LLM 传入的 JSON 参数、按工具 schema 校验，并复用准备阶段创建的
 * SandboxClient。source/user/chat 上下文由 client 自身持有，单次工具调用不再重复传递。
 */
export const runSandboxTools = async ({
  toolName,
  args,
  sandboxClient
}: {
  toolName: string;
  args: string;
  sandboxClient: SandboxClient;
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

  const result = await tool.execute({
    sandboxInstance: sandboxClient,
    params: parsedArgs.data as any
  });

  return {
    success: true,
    input: parsedArgs.data,
    response: result.response,
    ...(result.fileRefs?.length ? { fileRefs: result.fileRefs } : {}),
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
  const sandboxUserId = getSandboxUserId({ sourceType, userId });
  const sandboxId = getRunningSandboxId({
    sourceType,
    sourceId,
    userId: sandboxUserId
  });
  const instance = await getSandboxClient({
    sandboxId,
    sourceType,
    sourceId,
    userId: sandboxUserId,
    chatId
  });
  const runtimePaths = instance.getRuntimePaths();
  await prepareSandbox(
    {
      sandbox: instance.provider,
      sandboxClient: instance,
      workDirectory: runtimePaths.sessionWorkDirectory,
      workspaceRoot: runtimePaths.workspaceRoot
    },
    preparePackageMirrors()
  );
  await writeUrlFilesToSandbox(
    instance.provider,
    files.map((file) => ({
      ...file,
      path: instance.resolveRuntimePath(file.path, { allowAbsolutePath: true })
    }))
  );
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
