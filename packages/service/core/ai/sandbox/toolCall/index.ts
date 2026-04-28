import { sandboxToolMap } from '@fastgpt/global/core/ai/sandbox/constants';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { LangEnum } from '@fastgpt/global/common/i18n/type';
import { toolMap as getFileUrlToolMap } from './getFileUrl.tool';
import { toolMap as shellToolMap } from './shell.tool';
import { getSandboxClient } from '../controller';
import { parseJsonArgs } from '../../utils';
import { axios } from '../../../../common/api/axios';
import { serverRequestBaseUrl } from '../../../../common/api/serverRequest';
import type { FileWriteEntry } from '@fastgpt-sdk/sandbox-adapter';

const ToolMap = {
  ...getFileUrlToolMap,
  ...shellToolMap
};

export type SandboxToolCallResult = {
  success: boolean;
  input: Record<string, any>;
  response: string;
  durationSeconds: number;
};

export const runSandboxTools = async ({
  appId,
  userId,
  chatId,
  toolName,
  args
}: {
  appId: string;
  userId: string;
  chatId: string;
  toolName: string;
  args: string;
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

  // Parse args
  const parsedArgs = tool.zodSchema.safeParse(parseJsonArgs(args));
  if (!parsedArgs.success) {
    return {
      success: false,
      input: {},
      response: parsedArgs.error.message,
      durationSeconds: getDuration()
    };
  }

  const instance = await getSandboxClient({ appId, userId, chatId });
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

  const writeFilesData = await Promise.all(
    files
      .filter((file) => file.path)
      .map(async ({ path, url }): Promise<FileWriteEntry> => {
        const response = await axios.get<ArrayBuffer>(url, {
          baseURL: serverRequestBaseUrl,
          responseType: 'arraybuffer'
        });

        return {
          path,
          data: response.data
        };
      })
  );

  await instance.provider.writeFiles(writeFilesData);
};

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
