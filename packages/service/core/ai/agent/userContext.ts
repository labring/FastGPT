import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';
import { getLogger, LogCategories } from '../../../common/logger';
import { parseUrlToChatFileType } from '../../chat/fileContext';
import { getSafeSandboxInputFilename, type DeployedSkillInfo } from '../sandbox/interface/runtime';

export type AgentInputFile = {
  id: string;
  name: string;
  type: ChatFileTypeEnum;
  url: string;
};

type ParseAgentInputFilesParams = {
  files: UserChatItemFileItemType[];
  prefixId: string;
  requestOrigin?: string;
  maxFiles: number;
  urlTypeMap?: Record<string, ChatFileTypeEnum>;
};

/** 转义写入 Agent prompt XML 片段的外部文本。 */
export const escapeAgentPromptXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const isValidAgentFileUrl = (url: unknown): url is string => {
  if (typeof url !== 'string') return false;
  const validPrefixList = ['/', 'http', 'ws'];
  return validPrefixList.some((prefix) => url.startsWith(prefix));
};

export const normalizeAgentFileUrl = ({
  url,
  requestOrigin
}: {
  url: string;
  requestOrigin?: string;
}) => {
  if (!isValidAgentFileUrl(url)) return '';

  try {
    // 同源上传文件使用相对路径，避免模型后续通过工具读取时绕回公网域名。
    if (requestOrigin && url.startsWith(requestOrigin)) {
      return url.replace(requestOrigin, '');
    }

    return url;
  } catch (error) {
    getLogger(LogCategories.MODULE.AI.AGENT).warn('[Agent user context] Parse url error', {
      error
    });
    return '';
  }
};

/** 将对话文件转换成 Agent 内部稳定 id，统一 URL、类型、去重和限量规则。 */
export function parseAgentInputFiles({
  files,
  prefixId,
  requestOrigin,
  maxFiles,
  urlTypeMap
}: ParseAgentInputFilesParams): AgentInputFile[] {
  const normalizedFiles = files
    .map((file) => ({
      file,
      url: normalizeAgentFileUrl({ url: file.url, requestOrigin })
    }))
    .filter((item): item is { file: UserChatItemFileItemType; url: string } => Boolean(item.url));
  const uniqueFiles = Array.from(
    normalizedFiles
      .reduce((map, item) => {
        if (!map.has(item.url)) {
          map.set(item.url, item);
        }
        return map;
      }, new Map<string, { file: UserChatItemFileItemType; url: string }>())
      .values()
  );
  const usedNames = new Map<string, number>();

  return uniqueFiles
    .slice(0, maxFiles)
    .map(({ file, url }, index) => {
      const parsedFile = parseUrlToChatFileType({ url, urlTypeMap });
      if (!parsedFile) return;

      return {
        id: `${prefixId}-${index}`,
        name: getSafeSandboxInputFilename(file.name || parsedFile.name || url, index, usedNames),
        type: file.type && file.type !== ChatFileTypeEnum.file ? file.type : parsedFile.type,
        url: parsedFile.url
      };
    })
    .filter((file): file is AgentInputFile => !!file);
}

/** 仅保留模型可消费的多模态文件；普通文档由 read_files 提供内容。 */
export const getAgentMultimodalChatFiles = (files: AgentInputFile[]) =>
  files
    .filter((file) => file.type !== ChatFileTypeEnum.file)
    .map(({ name, type, url }) => ({ name, type, url }));

/** 构造 Agent 可用 Skill 列表，并保留平台 Skill 与子 Skill 的完整语义。 */
export function buildAgentSkillsPrompt(skillInfos: DeployedSkillInfo[] = []): string {
  if (skillInfos.length === 0) return '';

  return `## 技能
你可以使用可复用的技能。每个技能都提供针对特定任务的操作说明。当用户任务与某个技能的描述匹配时，先读取该技能的 SKILL.md 路径，然后再继续执行。不要仅凭技能描述推断完整工作流。
如果技能包含 app_name 或 app_description，它们表示平台 Skill 应用的名称和描述；name 和 description 表示该应用包内展开后的具体子 Skill。匹配任务时同时参考平台 Skill 应用信息和子 Skill 信息。如果用户、系统提示词或应用配置提到某个平台 Skill 应用名，应在该应用下选择最匹配的子 Skill。
当技能引用相对路径文件时，应以该技能的 SKILL.md 所在目录作为基准目录进行解析。
实际执行入口始终是子 Skill 的 path；平台 Skill 应用信息只用于帮助你把应用层语义对齐到具体子 Skill。
你可以通过 ${SANDBOX_READ_FILE_TOOL_NAME} 工具来读取完整的技能。
下面是可用的技能：

${skillInfos
  .map((info) =>
    [
      '<skill>',
      ...(info.appId ? [`<app_id>${escapeAgentPromptXml(info.appId)}</app_id>`] : []),
      ...(info.appName ? [`<app_name>${escapeAgentPromptXml(info.appName)}</app_name>`] : []),
      ...(info.appDescription
        ? [`<app_description>${escapeAgentPromptXml(info.appDescription)}</app_description>`]
        : []),
      `<name>${escapeAgentPromptXml(info.name)}</name>`,
      `<description>${escapeAgentPromptXml(info.description)}</description>`,
      `<directory>${escapeAgentPromptXml(info.directory)}</directory>`,
      `<path>${escapeAgentPromptXml(info.skillMdPath)}</path>`,
      '</skill>'
    ].join('\n')
  )
  .join('\n')}`;
}

/** 构造 Agent 对话文件提示，保持模型可见文本与原 workflow 链路一致。 */
export const buildAgentInputFilesPrompt = (files: AgentInputFile[] = []) => {
  if (files.length === 0) return '';

  return `## 对话文件
用户本次对话上传的文件，用途：
1. 可通过 ${SubAppIds.readFiles} 读取文档内容。
2. 图片、音频和视频已作为当前消息的多模态输入提供，应直接分析其内容；url 也可作为模型参数。

${files
  .map(
    (file) => `<file>
<id>${escapeAgentPromptXml(file.id)}</id>
<name>${escapeAgentPromptXml(file.name)}</name>
<type>${escapeAgentPromptXml(file.type)}</type>
<url>${escapeAgentPromptXml(file.url)}</url>
</file>`
  )
  .join('\n')}`;
};

/** 构造 Agent sandbox 的用户产物写入边界。 */
export const buildAgentSandboxFileWriteBoundaryPrompt = ({
  currentWorkingDirectory
}: {
  currentWorkingDirectory?: string;
}) => {
  if (!currentWorkingDirectory) return '';

  return `## Sandbox 文件写入边界
生成或修改文件时，必须严格区分系统目录和用户产物目录：
- 用户 Skill 产物根目录：${currentWorkingDirectory}/skills
- 如果任务需要创建或修改用户 Skill，只能写入：${currentWorkingDirectory}/skills/<skill-name>/
- 用户 Skill 主文件必须是：${currentWorkingDirectory}/skills/<skill-name>/SKILL.md
- 禁止写入：${currentWorkingDirectory}/<skill-name>/ 或 ${currentWorkingDirectory}/SKILL.md
- 禁止写入：/home/sandbox/.fastgpt/skills/、~/.fastgpt/skills/ 或任何 .fastgpt/skills/ 路径；这些路径只用于系统内置 Skill。`;
};
