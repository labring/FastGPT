import {
  SANDBOX_GET_FILE_URL_TOOL_NAME,
  SANDBOX_TOOL_NAME
} from '@fastgpt/global/core/ai/sandbox/constants';

/* ===== Inject system reminder prompt ===== */
export const injectToolsPrompt = (tools: { name: string; description: string }[] = []) => {
  if (tools.length === 0) return '';

  return `# Tools
你可以通过以下工具来辅助完成任务:
${tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')}`;
};
export const injectSandboxPrompt = () => {
  return `# Sandbox tools
通过工具来操作沙盒，从而完成任务，沙盒环境：
- Linux 沙盒环境（Ubuntu 22.04）
- 预装：bash / python3 / node / bun / git / curl
- 可自行安装软件包（apt / pip / npm）

可用工具：
- ${SANDBOX_TOOL_NAME}: 执行 shell 命令，支持文件操作、代码运行、包安装等。
- ${SANDBOX_GET_FILE_URL_TOOL_NAME}: 获取文件的临时访问链接`;
};
export const injectUserPrompt = (userPrompt?: string) => {
  if (!userPrompt) return '';
  return `# User Prompt
${userPrompt}`;
};
export const getInjectSystemReminderPrompt = ({
  userPrompt,
  toolsPrompt,
  sandboxPrompt
}: {
  userPrompt?: string;
  toolsPrompt?: string;
  sandboxPrompt?: string;
}) => {
  const list = [userPrompt, toolsPrompt, sandboxPrompt].filter(Boolean).join('\n');
  return `<system-reminder>
As you answer the user's questions, you can use the following context:

${list}
</system-reminder>`;
};

/* ===== Inject user query ===== */
export const getUserFilesPrompt = (
  files: { id?: string; name: string; sandboxPath?: string; content?: string }[] = []
) => {
  if (files.length === 0) return '';
  return `# Input Files
用户本次上传的文件：

${files
  .map((file) =>
    `<file>
${file.id ? `<id>${file.id}</id>` : ''}
<name>${file.name}</name>
${file.sandboxPath ? `<sandboxPath>${file.sandboxPath}</sandboxPath>` : ''}
${file.content ? `<content>${file.content}</content>` : ''}
</file>`.trim()
  )
  .join('\n')}`;
};
export const injectUserQueryTimePrompt = (time: string) => {
  return `# Current time
${time}`;
};
export const injectUserQueryPrompt = ({
  query = '',
  filePrompt,
  timePrompt
}: {
  query?: string;
  filePrompt?: string;
  timePrompt?: string;
}) => {
  const list = [filePrompt, timePrompt].filter(Boolean).join('\n');

  if (list) {
    return `<system-reminder>
As you answer the user's questions, you can use the following context:

${list}
</system-reminder>

${query}`.trim();
  }

  return query || '';
};
