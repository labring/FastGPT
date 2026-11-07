import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DeployedSkillInfo } from '../../../../../../ai/sandbox/application/runtime/skill/types';
import { READ_FILES_TOOL_NAME } from '../../../../../../ai/llm/agentLoop/interface';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import type { AgentLoopCoreInputFile } from './files';

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

/**
 * 生成当前输入文件的模型可见提示。
 * 文件分类已在统一推测入口完成，此处只序列化类型与文件元信息，不再推断扩展名。
 */
export const buildAgentLoopCoreInputFilesPrompt = (files: AgentLoopCoreInputFile[] = []) => {
  if (files.length === 0) return '';

  return `## 对话文件

用户本次对话上传的文件，按 type 使用：
1. document：当前解析器支持的文档，可通过 ${READ_FILES_TOOL_NAME} 读取内容。
2. image、audio、video：图片、音频、视频，由支持对应能力的模型或工具处理。
3. unknown：当前文档解析器不支持或无法识别的格式，不要使用 ${READ_FILES_TOOL_NAME} 读取；应选择适合该格式的其他工具处理。
4. 可把 url 作为模型或工具参数；有 sandboxPath 时，也可通过沙箱工具处理文件。

${files
  .map(
    (file) => `<file>
<name>${escapeXml(file.name)}</name>
<type>${escapeXml(file.type)}</type>
<url>${escapeXml(file.url)}</url>
${file.sandboxPath ? `<sandboxPath>${escapeXml(file.sandboxPath)}</sandboxPath>` : ''}
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

当用户任务与某个技能的描述匹配时，先使用 ${SANDBOX_READ_FILE_TOOL_NAME} 读取完整的技能文件，然后依据技能完整描述来执行任务。

<available_skills>
${skillInfos
  .map((info) =>
    [
      '<skill>',
      `<name>${escapeXml(info.name)}</name>`,
      `<description>${escapeXml(info.description)}</description>`,
      `<location>${escapeXml(info.skillMdPath)}</location>`,
      '</skill>'
    ].join('\n')
  )
  .join('\n')}
</available_skills>`;
}

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
${currentWorkingDirectory ? `当前沙盒的工作目录: ${currentWorkingDirectory}` : ''}`;
};

/**
 * 生成当前用户消息内的动态上下文提醒。
 * 该内容是 user message 的一部分，不是 system role prompt；历史消息只应注入稳定文件片段。
 */
export type AgentLoopCoreUserReminderContext = {
  skillInfos?: DeployedSkillInfo[];
  selectedDataset?: AgentLoopCoreSelectedDatasetContext[];
  currentTime?: string;
  currentWorkingDirectory?: string;
};

export const buildAgentLoopCoreUserReminderInput = ({
  query = '',
  skillInfos,
  filesInfo,
  selectedDataset,
  currentTime,
  currentWorkingDirectory
}: AgentLoopCoreUserReminderContext & {
  query?: string;
  filesInfo?: AgentLoopCoreInputFile[];
}) => {
  const reminder = [
    buildAgentLoopCoreSkillsPrompt(skillInfos),
    buildAgentLoopCoreInputFilesPrompt(filesInfo),
    buildAgentLoopCoreInputDatasetsPrompt(selectedDataset),
    buildAgentLoopCoreEnvPrompt({ currentTime, currentWorkingDirectory })
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!reminder) return query || '';

  return `<system-reminder>
可以借助以下信息来完成任务

${reminder}
</system-reminder>
${query}`.trim();
};
