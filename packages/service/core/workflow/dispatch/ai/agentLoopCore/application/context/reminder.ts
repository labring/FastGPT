import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DeployedSkillInfo } from '../../../../../../ai/sandbox/interface/runtime';
import { READ_FILES_TOOL_NAME } from '../../../../../../ai/llm/agentLoop/interface';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';

export type AgentLoopCoreInputFile = {
  id: string;
  name: string;
  type: ChatFileTypeEnum;
  url: string;
};

export type AgentLoopCoreSelectedDatasetInput = Pick<SelectedDatasetType, 'datasetId'> &
  Partial<Omit<SelectedDatasetType, 'datasetId'>>;

export type AgentLoopCoreSelectedDatasetContext = AgentLoopCoreSelectedDatasetInput & {
  name: string;
  intro?: string;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const filterAgentLoopCoreDocumentFiles = (files: AgentLoopCoreInputFile[] = []) =>
  files.filter((file) => file.type === ChatFileTypeEnum.file);

/**
 * 生成当前输入文件的模型可见提示。
 * 文档可通过 read_files 读取；其他多模态文件同时保留 URL，供模型或工具引用。
 */
export const buildAgentLoopCoreInputFilesPrompt = (files: AgentLoopCoreInputFile[] = []) => {
  if (files.length === 0) return '';

  return `## 对话文件
用户本次对话上传的文件，用途：
1. 可通过 ${READ_FILES_TOOL_NAME} 读取文档内容。
2. 可把 url 作为模型参数。

${files
  .map(
    (file) => `<file>
<id>${escapeXml(file.id)}</id>
<name>${escapeXml(file.name)}</name>
<type>${escapeXml(file.type)}</type>
<url>${escapeXml(file.url)}</url>
</file>`
  )
  .join('\n')}`;
};

/**
 * 生成已部署技能的模型可见提示。
 * 技能内容需要模型后续通过 sandbox read_file 读取，避免只根据描述臆测完整步骤。
 */
export function buildAgentLoopCoreSkillsPrompt(skillInfos: DeployedSkillInfo[] = []): string {
  if (skillInfos.length === 0) return '';

  return `## 技能
你可以使用可复用的技能。每个技能都提供针对特定任务的操作说明。当用户任务与某个技能的描述匹配时，先读取该技能的 SKILL.md 路径，然后再继续执行。不要仅凭技能描述推断完整工作流。
如果技能包含 app_name 或 app_description，它们表示平台 Skill 应用的名称和描述；name 和 description 表示该应用包内展开后的具体子 Skill。匹配任务时同时参考平台 Skill 应用信息和子 Skill 信息。
当技能引用相对路径文件时，应以该技能的 SKILL.md 所在目录作为基准目录进行解析。
实际执行入口始终是子 Skill 的 path；平台 Skill 应用信息只用于帮助对齐具体子 Skill。
你可以通过 ${SANDBOX_READ_FILE_TOOL_NAME} 工具来读取完整的技能。
下面是可用的技能：

${skillInfos
  .map((info) =>
    [
      '<skill>',
      ...(info.appId ? [`<app_id>${escapeXml(info.appId)}</app_id>`] : []),
      ...(info.appName ? [`<app_name>${escapeXml(info.appName)}</app_name>`] : []),
      ...(info.appDescription
        ? [`<app_description>${escapeXml(info.appDescription)}</app_description>`]
        : []),
      `<name>${escapeXml(info.name)}</name>`,
      `<description>${escapeXml(info.description)}</description>`,
      `<directory>${escapeXml(info.directory)}</directory>`,
      `<path>${escapeXml(info.skillMdPath)}</path>`,
      '</skill>'
    ].join('\n')
  )
  .join('\n')}`;
}

const buildAgentLoopCoreSandboxWriteBoundaryPrompt = (currentWorkingDirectory?: string) => {
  if (!currentWorkingDirectory) return '';

  return `## Sandbox 文件写入边界
生成或修改文件时，必须严格区分系统目录和用户产物目录：
- 用户 Skill 产物根目录：${currentWorkingDirectory}/skills
- 如果任务需要创建或修改用户 Skill，只能写入：${currentWorkingDirectory}/skills/<skill-name>/
- 用户 Skill 主文件必须是：${currentWorkingDirectory}/skills/<skill-name>/SKILL.md
- 禁止写入：${currentWorkingDirectory}/<skill-name>/ 或 ${currentWorkingDirectory}/SKILL.md
- 禁止写入：/home/sandbox/.fastgpt/skills/、~/.fastgpt/skills/ 或任何 .fastgpt/skills/ 路径；这些路径只用于系统内置 Skill。`;
};

const buildAgentLoopCoreInputDatasetsPrompt = (
  selectedDataset: AgentLoopCoreSelectedDatasetContext[] = []
) => {
  if (selectedDataset.length === 0) return '';

  return `## 知识库
用户当前可用的知识库：

${selectedDataset
  .map((item) =>
    [
      '<dataset>',
      `<id>${escapeXml(item.datasetId)}</id>`,
      `<name>${escapeXml(item.name)}</name>`,
      ...(item.intro ? [`<description>${escapeXml(item.intro)}</description>`] : []),
      '</dataset>'
    ].join('\n')
  )
  .join('\n')}`;
};

const buildAgentLoopCoreEnvPrompt = ({
  currentTime,
  currentWorkingDirectory
}: {
  currentTime?: string;
  currentWorkingDirectory?: string;
}) => {
  if (!currentTime && !currentWorkingDirectory) return '';

  return `## 背景信息
${currentTime ? `当前时间: ${currentTime}` : ''}
${currentWorkingDirectory ? `当前 sandbox 工作目录: ${currentWorkingDirectory}` : ''}`;
};

/**
 * 生成当前用户消息内的动态上下文提醒。
 * 该内容是 user message 的一部分，不是 system role prompt；历史消息只应注入稳定文件片段。
 */
export const buildAgentLoopCoreUserReminderInput = ({
  query = '',
  skillInfos,
  filesInfo,
  selectedDataset,
  currentTime,
  currentWorkingDirectory
}: {
  query?: string;
  skillInfos?: DeployedSkillInfo[];
  filesInfo?: AgentLoopCoreInputFile[];
  selectedDataset?: AgentLoopCoreSelectedDatasetContext[];
  currentTime?: string;
  currentWorkingDirectory?: string;
}) => {
  const reminder = [
    buildAgentLoopCoreSkillsPrompt(skillInfos),
    buildAgentLoopCoreSandboxWriteBoundaryPrompt(currentWorkingDirectory),
    buildAgentLoopCoreInputFilesPrompt(filesInfo),
    buildAgentLoopCoreInputDatasetsPrompt(selectedDataset),
    buildAgentLoopCoreEnvPrompt({ currentTime, currentWorkingDirectory })
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!reminder) return query || '';

  return `<system-reminder>
依据以下内容完成任务

${reminder}
</system-reminder>
${query}`.trim();
};
