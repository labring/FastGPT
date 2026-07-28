import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  chatValue2RuntimePrompt,
  chats2GPTMessages,
  runtimePrompt2ChatsValue
} from '@fastgpt/global/core/chat/adapt';
import type {
  ChatItemMiniType,
  UserChatItemFileItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { READ_FILES_TOOL_NAME } from '../../llm/agentLoop/interface';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { parseUrlToChatFileType } from '../../../chat/fileContext';
import {
  getSafeSandboxInputFilename,
  type DeployedSkillInfo
} from '../../sandbox/interface/runtime';

export const SKILL_DEBUG_MAX_FILES = 10;

export type SkillDebugInputFile = {
  name: string;
  type: ChatFileTypeEnum;
  url: string;
};

const escapePromptXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeFileUrl = ({ url, requestOrigin }: { url: string; requestOrigin?: string }) => {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return '';
  if (/^(https?:|data:|ws:|wss:)/i.test(normalizedUrl)) return normalizedUrl;
  if (!requestOrigin) return normalizedUrl;

  try {
    return new URL(normalizedUrl, requestOrigin).toString();
  } catch {
    return '';
  }
};

/** 将 ChatBox 文件归一化为 Agent Loop 可使用的 URL、类型和安全文件名。 */
export const parseSkillDebugInputFiles = ({
  files,
  requestOrigin,
  maxFiles = SKILL_DEBUG_MAX_FILES
}: {
  files: UserChatItemFileItemType[];
  requestOrigin?: string;
  maxFiles?: number;
}): SkillDebugInputFile[] => {
  const normalizedFiles = files
    .map((file) => ({
      file,
      url: normalizeFileUrl({ url: file.url ?? '', requestOrigin })
    }))
    .filter((item): item is { file: UserChatItemFileItemType; url: string } => !!item.url);
  const uniqueFiles = Array.from(
    normalizedFiles
      .reduce((map, item) => {
        if (!map.has(item.url)) map.set(item.url, item);
        return map;
      }, new Map<string, { file: UserChatItemFileItemType; url: string }>())
      .values()
  );
  const usedNames = new Map<string, number>();

  return uniqueFiles
    .slice(0, maxFiles)
    .map(({ file, url }, index) => {
      const parsedFile = parseUrlToChatFileType({
        url,
        urlTypeMap: file.type ? { [url]: file.type } : undefined
      });
      if (!parsedFile) return;

      return {
        name: getSafeSandboxInputFilename(file.name || parsedFile.name || url, index, usedNames),
        type: file.type && file.type !== ChatFileTypeEnum.file ? file.type : parsedFile.type,
        url: parsedFile.url
      };
    })
    .filter((file): file is SkillDebugInputFile => !!file);
};

const buildSkillsPrompt = (skillInfos: DeployedSkillInfo[]) => {
  if (skillInfos.length === 0) return '';

  return `## 技能

以下技能为特定任务提供专门的操作说明：

- 当用户任务与某个技能的描述匹配时，先使用 ${SANDBOX_READ_FILE_TOOL_NAME} 读取完整的技能文件，再继续执行。不要仅凭技能描述推断完整工作流。
- 当技能文件引用相对路径时，以该技能文件所在目录为基准解析，并在工具调用中使用解析后的路径。

<available_skills>
${skillInfos
  .map((info) =>
    [
      '<skill>',
      `<name>${escapePromptXml(info.name)}</name>`,
      `<description>${escapePromptXml(info.description)}</description>`,
      `<location>${escapePromptXml(info.skillMdPath)}</location>`,
      '</skill>'
    ].join('\n')
  )
  .join('\n')}
</available_skills>`;
};

const buildInputFilesPrompt = (files: SkillDebugInputFile[]) => {
  if (files.length === 0) return '';

  return `## 对话文件
用户本次对话上传的文件，用途：
1. 可通过 ${READ_FILES_TOOL_NAME} 读取文档内容。
2. 图片、音频和视频已作为当前消息的多模态输入提供；URL 也可作为模型参数。

${files
  .map(
    (file) => `<file>
<name>${escapePromptXml(file.name)}</name>
<type>${escapePromptXml(file.type)}</type>
<url>${escapePromptXml(file.url)}</url>
</file>`
  )
  .join('\n')}`;
};

const buildSandboxWriteBoundaryPrompt = (currentWorkingDirectory?: string) => {
  if (!currentWorkingDirectory) return '';

  return `## Sandbox 文件写入边界
生成或修改文件时，必须严格区分系统目录和用户产物目录：
- 用户 Skill 产物根目录：${currentWorkingDirectory}/skills
- 如果任务需要创建或修改用户 Skill，只能写入：${currentWorkingDirectory}/skills/<skill-name>/
- 用户 Skill 主文件必须是：${currentWorkingDirectory}/skills/<skill-name>/SKILL.md
- 禁止写入：${currentWorkingDirectory}/<skill-name>/ 或 ${currentWorkingDirectory}/SKILL.md
- 禁止写入：/home/sandbox/.fastgpt/skills/、~/.fastgpt/skills/ 或任何 .fastgpt/skills/ 路径；这些路径只用于系统内置 Skill。`;
};

const buildUserReminderInput = ({
  query,
  skillInfos,
  files,
  currentWorkingDirectory,
  currentTime
}: {
  query: string;
  skillInfos: DeployedSkillInfo[];
  files: SkillDebugInputFile[];
  currentWorkingDirectory?: string;
  currentTime?: string;
}) => {
  const reminder = [
    buildSkillsPrompt(skillInfos),
    buildSandboxWriteBoundaryPrompt(currentWorkingDirectory),
    buildInputFilesPrompt(files),
    currentTime || currentWorkingDirectory
      ? `## 背景信息${currentTime ? `\n当前时间: ${currentTime}` : ''}${
          currentWorkingDirectory ? `\n当前 sandbox 工作目录: ${currentWorkingDirectory}` : ''
        }`
      : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!reminder) return query;
  return `<system-reminder>
依据以下内容完成任务

${reminder}
</system-reminder>
${query}`.trim();
};

/**
 * 构建 Skill Debug Agent Loop 上下文。
 *
 * 文档只通过 reminder 和 read_files 暴露，多模态文件保留为模型 content part；ask 恢复时
 * 额外返回不含用户回答文本的文件消息，防止回答被同时当作 tool response 和 user message。
 */
export const buildSkillDebugUserContext = ({
  histories,
  currentUserValue,
  currentDataId,
  requestOrigin,
  maxFiles = SKILL_DEBUG_MAX_FILES,
  skillInfos,
  currentWorkingDirectory,
  currentTime
}: {
  histories: ChatItemMiniType[];
  currentUserValue: UserChatItemValueItemType[];
  currentDataId: string;
  requestOrigin?: string;
  maxFiles?: number;
  skillInfos: DeployedSkillInfo[];
  currentWorkingDirectory?: string;
  currentTime: string;
}): {
  messages: ChatCompletionMessageParam[];
  askContinuationMessages: ChatCompletionMessageParam[];
  readableFileUrls: string[];
} => {
  const readableFileUrls = new Set<string>();
  let askContinuationMessages: ChatCompletionMessageParam[] = [];
  const sourceMessages: ChatItemMiniType[] = [
    ...histories,
    {
      dataId: currentDataId,
      obj: ChatRoleEnum.Human,
      value: currentUserValue
    }
  ];
  const currentMessageIndex = sourceMessages.length - 1;
  const rewrittenMessages = sourceMessages.map((message, index) => {
    if (message.obj !== ChatRoleEnum.Human) return message;

    const { text = '', files = [] } = chatValue2RuntimePrompt(message.value);
    const inputFiles = parseSkillDebugInputFiles({ files, requestOrigin, maxFiles });
    inputFiles.forEach((file) => {
      if (file.type === ChatFileTypeEnum.file) readableFileUrls.add(file.url);
    });
    const isCurrentMessage = index === currentMessageIndex;
    const buildMessageValue = (query: string) =>
      runtimePrompt2ChatsValue({
        files: inputFiles
          .filter((file) => file.type !== ChatFileTypeEnum.file)
          .map(({ name, type, url }) => ({ name, type, url })),
        text: buildUserReminderInput({
          query,
          files: inputFiles,
          skillInfos: isCurrentMessage ? skillInfos : [],
          currentWorkingDirectory: isCurrentMessage ? currentWorkingDirectory : undefined,
          currentTime: isCurrentMessage ? currentTime : undefined
        })
      });

    if (isCurrentMessage && inputFiles.length > 0) {
      askContinuationMessages = chats2GPTMessages({
        messages: [{ ...message, value: buildMessageValue('') }],
        reserveId: false,
        reserveTool: true
      }).filter((item) => item.role !== 'system');
    }

    return {
      ...message,
      value: buildMessageValue(text)
    };
  });

  return {
    messages: chats2GPTMessages({
      messages: rewrittenMessages,
      reserveId: false,
      reserveTool: true
    }).filter((message) => message.role !== 'system'),
    askContinuationMessages,
    readableFileUrls: [...readableFileUrls]
  };
};
