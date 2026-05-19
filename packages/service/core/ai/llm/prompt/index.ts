/**
 * 将本轮上传文件整理为文本上下文，包含文件名、沙盒路径和可选文件内容。
 */
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

/**
 * 生成最终 user message。
 * 如果存在文件或时间上下文，会先插入 system-reminder，再拼接用户原始 query。
 */
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
