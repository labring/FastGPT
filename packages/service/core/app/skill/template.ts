import type { AppSchema } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { promises as fsPromises } from 'fs';
import fs from 'fs';
import path from 'path';
import SkillErr, { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { addLog } from '../../../common/system/log';

interface GenerateSkillMarkdownParams {
  app: AppSchema;
  apiKey: string;
  keyName: string;
  expiredTime: undefined; // 永不过期
  baseUrl: string;
  skillName: string; // 用户输入的 Skill 名称（kebab-case）
  skillDescription: string; // 用户输入的 Skill 描述
  locale?: string; // 语言代码，默认 zh-CN
}

interface GenerateChatScriptParams {
  apiKey: string;
  baseUrl: string;
  appId: string;
  app: AppSchema;
}

// 获取模板文件的绝对路径
function getTemplatePath(fileName: string): string {
  // process.cwd() 在 Next.js 项目中返回 projects/app 目录
  const templatePath = path.join(process.cwd(), `public/fastgpt-to-skill-template/${fileName}`);

  // 检查文件是否存在
  if (!fs.existsSync(templatePath)) {
    addLog.error(`Template file not found: ${templatePath}`);
    throw SkillErr[SkillErrEnum.exportFailed];
  }

  return templatePath;
}

/**
 * 生成 SKILL.md 文件内容（符合 Claude Skill 官方规范）
 * 基于模板文件替换变量
 */
export async function generateSkillMarkdown(params: GenerateSkillMarkdownParams): Promise<string> {
  const {
    app,
    apiKey,
    keyName,
    expiredTime,
    baseUrl,
    skillName,
    skillDescription,
    locale = 'zh-CN'
  } = params;

  // 根据 locale 选择模板文件
  const templateFileName = locale === 'en' ? 'SKILL_EN.md' : 'SKILL.md';
  const templatePath = getTemplatePath(templateFileName);

  let template = await fsPromises.readFile(templatePath, 'utf-8');

  // 提取应用变量
  const variables = app.chatConfig?.variables || [];
  const isAssistant = app.type === AppTypeEnum.assistant;

  // 格式化日期（根据 locale 选择格式）
  const formatDate = (date: Date) => {
    const localeCode = locale === 'en' ? 'en-US' : 'zh-CN';
    return new Date(date).toLocaleString(localeCode, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 生成 variables 调用示例段落（仅非 assistant 且有变量时输出）
  const variablesUsage = generateVariablesUsage(variables, isAssistant, locale);

  // 生成文件上传使用说明（assistant 类型不支持文件上传）
  const fileUploadUsage = generateFileUploadUsage(isAssistant, locale);

  // 准备所有替换变量
  const replacements: Record<string, string> = {
    '{skillName}': skillName,
    '{skillDescription}': skillDescription
      .split('\n')
      .map((line) => '  ' + line)
      .join('\n'),
    '{appName}': app.name,
    '{appIntro}': app.intro || (locale === 'en' ? 'No introduction available' : '暂无介绍'),
    '{apiKey}': apiKey,
    '{keyName}': keyName,
    '{expiredTime}': locale === 'en' ? 'Never expires' : '永不过期',
    '{baseUrl}': baseUrl,
    '{appId}': String(app._id),
    '{appType}': getAppTypeLabel(app.type, locale),
    '{exportTime}': formatDate(new Date()),
    '{variablesUsage}': variablesUsage,
    '{fileUploadUsage}': fileUploadUsage
  };

  // 执行替换
  for (const [key, value] of Object.entries(replacements)) {
    template = template.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return template;
}

/**
 * 读取 scripts/chat.js 模板，根据应用类型选择不同的模板文件
 * assistant 类型应用使用 chat-assistant.js（不支持文件上传）
 * 其他类型应用使用 chat.js（完整功能）
 */
export async function generateChatScript(params: GenerateChatScriptParams): Promise<string> {
  const { app } = params;
  const isAssistant = app.type === AppTypeEnum.assistant;

  // 根据应用类型选择不同的模板文件
  const templateFileName = isAssistant ? 'chat-assistant.js' : 'chat.js';
  const scriptPath = getTemplatePath(`scripts/${templateFileName}`);

  return fsPromises.readFile(scriptPath, 'utf-8');
}

/**
 * 读取 scripts/config.json 模板，替换配置占位符后返回最终内容
 */
export async function generateConfigJson(params: GenerateChatScriptParams): Promise<string> {
  const { apiKey, baseUrl, appId } = params;

  const configPath = getTemplatePath('scripts/config.json');
  let config = await fsPromises.readFile(configPath, 'utf-8');

  config = config
    .replace(/\{baseUrl\}/g, baseUrl)
    .replace(/\{apiKey\}/g, apiKey)
    .replace(/\{appId\}/g, appId);

  return config;
}

/**
 * 生成应用类型标签（支持多语言）
 */
function getAppTypeLabel(type: `${AppTypeEnum}`, locale: string = 'zh-CN'): string {
  if (locale === 'en') {
    const typeMapEn: Record<string, string> = {
      [AppTypeEnum.simple]: 'Simple Chat',
      [AppTypeEnum.workflow]: 'Workflow',
      [AppTypeEnum.chatAgent]: 'Agent',
      [AppTypeEnum.assistant]: 'Assistant',
      [AppTypeEnum.workflowTool]: 'Workflow Tool',
      [AppTypeEnum.httpPlugin]: 'HTTP Plugin',
      [AppTypeEnum.mcpToolSet]: 'Tool Set',
      [AppTypeEnum.httpToolSet]: 'HTTP Tool Set',
      [AppTypeEnum.tool]: 'Tool',
      [AppTypeEnum.folder]: 'Folder',
      [AppTypeEnum.toolFolder]: 'Tool Folder',
      [AppTypeEnum.hidden]: 'Hidden'
    };
    return typeMapEn[type] || type;
  }

  const typeMap: Record<string, string> = {
    [AppTypeEnum.simple]: '简易对话',
    [AppTypeEnum.workflow]: '工作流',
    [AppTypeEnum.chatAgent]: 'Agent',
    [AppTypeEnum.assistant]: '助手应用',
    [AppTypeEnum.workflowTool]: '工作流工具',
    [AppTypeEnum.httpPlugin]: 'HTTP 插件',
    [AppTypeEnum.mcpToolSet]: '工具集',
    [AppTypeEnum.httpToolSet]: 'HTTP 工具集',
    [AppTypeEnum.tool]: '工具',
    [AppTypeEnum.folder]: '文件夹',
    [AppTypeEnum.toolFolder]: '工具文件夹',
    [AppTypeEnum.hidden]: '隐藏'
  };
  return typeMap[type] || type;
}

/**
 * 生成应用变量的调用示例段落
 * assistant 类型或无变量时返回空字符串
 */
function generateVariablesUsage(
  variables: any[],
  isAssistant: boolean,
  locale: string = 'zh-CN'
): string {
  if (isAssistant || !variables || variables.length === 0) {
    return '';
  }

  const varObj = variables.map((v) => `    ${v.key}: '示例值'`).join(',\n');
  const varDesc = variables
    .map(
      (v) =>
        `| \`${v.key}\` | ${v.type} | ${v.required ? (locale === 'en' ? 'Yes' : '是') : locale === 'en' ? 'No' : '否'} | ${v.label || '-'} |`
    )
    .join('\n');

  if (locale === 'en') {
    return `### Chat with Application Variables

This application requires the following variables:

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
${varDesc}

\`\`\`javascript
const { chat } = require('./scripts/chat');

const { reply } = await chat({
  message: 'Your question',
  variables: {
${varObj}
  }
});
\`\`\`
`;
  }

  return `### 携带应用变量的对话

本应用需要传入以下变量：

| 变量名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
${varDesc}

\`\`\`javascript
const { chat } = require('./scripts/chat');

const { reply } = await chat({
  message: '你的问题',
  variables: {
${varObj}
  }
});
\`\`\`
`;
}

/**
 * 生成文件上传使用说明段落
 * assistant 类型不支持文件上传，返回空字符串
 */
function generateFileUploadUsage(isAssistant: boolean, locale: string = 'zh-CN'): string {
  if (isAssistant) {
    return '';
  }

  if (locale === 'en') {
    return `### Chat with Image (Online URL)

\`\`\`javascript
const { chat } = require('./scripts/chat');

const { reply } = await chat({
  message: 'Please analyze this image',
  imageUrl: 'https://example.com/image.png'
});
\`\`\`

### Chat with Local File

Files must share the same \`chatId\` as the conversation — FastGPT uses it to verify file ownership.
Flow: start a chat to get a \`chatId\` → upload the file → continue the conversation with the file URL.

\`\`\`javascript
const { chat, uploadFile } = require('./scripts/chat');

// Step 1: Start a chat to obtain a chatId
const init = await chat({ message: 'Hello' });
const { chatId } = init;

// Step 2: Upload the local file using the same chatId
const fileUrl = await uploadFile('/path/to/document.pdf', chatId);

// Step 3: Continue the conversation in the same session with the file
const { reply } = await chat({
  message: 'Please summarize the main content of this file',
  fileUrl,
  fileName: 'document.pdf',
  chatId
});
console.log(reply);
\`\`\`
`;
  }

  return `### 带图片的对话（在线 URL）

\`\`\`javascript
const { chat } = require('./scripts/chat');

const { reply } = await chat({
  message: '请分析这张图片',
  imageUrl: 'https://example.com/image.png'
});
\`\`\`

### 带本地文件的对话

文件必须与对话共用同一个 \`chatId\`，FastGPT 凭此关联文件权限。
流程：先发起一次对话拿到 \`chatId\` → 上传文件 → 携带文件 URL 继续对话。

\`\`\`javascript
const { chat, uploadFile } = require('./scripts/chat');

// 第一步：发起对话，获取 chatId
const init = await chat({ message: '你好' });
const { chatId } = init;

// 第二步：上传本地文件（传入同一 chatId，FastGPT 据此校验文件归属）
const fileUrl = await uploadFile('/path/to/document.pdf', chatId);

// 第三步：携带文件 URL 在同一会话中继续对话
const { reply } = await chat({
  message: '请总结这个文件的主要内容',
  fileUrl,
  fileName: 'document.pdf',
  chatId
});
console.log(reply);
\`\`\`
`;
}
