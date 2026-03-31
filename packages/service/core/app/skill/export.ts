import archiver from 'archiver';
import type { NextApiResponse } from 'next';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { generateSkillMarkdown, generateChatScript, generateConfigJson } from './template';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import SkillErr, { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { addLog } from '../../../common/system/log';
import { getAppLatestVersion } from '../version/controller';

interface ExportSkillZipParams {
  app: AppSchema;
  apiKey: string;
  keyName: string;
  expiredTime: undefined; // 永不过期
  baseUrl: string;
  skillName: string; // 用户输入的 Skill 名称
  skillDescription: string; // 用户输入的 Skill 描述
  locale?: string; // 语言代码，默认 zh-CN
  res: NextApiResponse;
}

// 验证 skillName 格式（仅允许小写字母、数字和连字符）
function validateSkillName(skillName: string): void {
  if (!skillName || skillName.trim().length === 0) {
    throw new Error(SkillErrEnum.exportInvalidSkillName);
  }
  if (skillName.length > 64) {
    throw new Error(SkillErrEnum.exportSkillNameTooLong);
  }
  if (!/^[a-z0-9-]+$/.test(skillName)) {
    throw new Error(SkillErrEnum.exportInvalidSkillName);
  }
}

// 验证 skillDescription
function validateSkillDescription(skillDescription: string): void {
  if (!skillDescription || skillDescription.trim().length === 0) {
    throw new Error(SkillErrEnum.exportMissingSkillParams);
  }
  if (skillDescription.length > 1024) {
    throw new Error(SkillErrEnum.exportSkillDescriptionTooLong);
  }
}

// 验证 baseUrl
function validateBaseUrl(baseUrl: string): void {
  if (!baseUrl || baseUrl.trim().length === 0) {
    throw new Error('baseUrl is required');
  }
  try {
    new URL(baseUrl);
  } catch (error) {
    throw new Error('Invalid baseUrl format');
  }
}

// 验证 apiKey
function validateApiKey(apiKey: string): void {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error('apiKey is required');
  }
}

/**
 * 生成并流式输出 Skill ZIP 压缩包
 * 使用 archiver 库直接流式写入响应，无需临时文件
 */
export async function exportSkillZip(params: ExportSkillZipParams): Promise<void> {
  const {
    app,
    apiKey,
    keyName,
    expiredTime,
    baseUrl,
    skillName,
    skillDescription,
    locale = 'zh-CN',
    res
  } = params;

  // 输入验证
  validateSkillName(skillName);
  validateSkillDescription(skillDescription);
  validateBaseUrl(baseUrl);
  validateApiKey(apiKey);

  // 使用 skillName 作为文件夹名和 ZIP 文件名
  // skillName 已经是 kebab-case 格式，无需额外处理
  const skillFolderName = skillName;
  const zipFileName = `${skillName}.zip`;

  // 设置响应头
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);
  res.setHeader('Cache-Control', 'no-cache');

  // 创建 archiver 实例
  const archive = archiver('zip', {
    zlib: { level: 9 } // 最高压缩级别
  });

  // 错误处理 - 正确处理异步错误
  archive.on('error', (err) => {
    addLog.error('Archive error:', err);
    // 销毁响应流，避免发送不完整数据
    if (!res.headersSent) {
      const archiveErr = SkillErr[SkillErrEnum.archiveError];
      res.status(500).json(archiveErr);
    } else {
      res.destroy();
    }
  });

  // 监听压缩进度（可选）
  archive.on('warning', (warn) => {
    addLog.warn('Archive warning:', warn);
  });

  // 将 archive 流连接到响应
  archive.pipe(res);

  try {
    // 获取最新发布版本的配置
    const { versionId, versionName, nodes, edges, chatConfig } = await getAppLatestVersion(
      String(app._id),
      app
    );

    // 1. 添加 SKILL.md
    const skillMarkdown = await generateSkillMarkdown({
      app,
      apiKey,
      keyName,
      expiredTime,
      baseUrl,
      skillName, // 传递用户输入的 skillName
      skillDescription, // 传递用户输入的 skillDescription
      locale // 传递语言代码
    });
    archive.append(skillMarkdown, { name: `${skillFolderName}/SKILL.md` });

    // 2. 添加 scripts/config.json（含真实配置，由导出时生成）
    const configJson = await generateConfigJson({ apiKey, baseUrl, appId: String(app._id), app });
    archive.append(configJson, { name: `${skillFolderName}/scripts/config.json` });

    // 3. 添加 scripts/chat.js（封装好的调用客户端，从 config.json 读取配置）
    const chatScript = await generateChatScript({ apiKey, baseUrl, appId: String(app._id), app });
    archive.append(chatScript, { name: `${skillFolderName}/scripts/chat.js` });

    // 4. 添加 package.json（依赖配置文件）
    const packageJson = {
      name: skillName,
      version: '1.0.0',
      description: skillDescription,
      main: 'scripts/chat.js',
      scripts: {
        test: "node -e \"const { chat } = require('./scripts/chat'); chat({ message: '你好' }).then(r => console.log(r.reply)).catch(e => console.error(e.message));\""
      },
      dependencies: {
        axios: '^1.6.0'
      }
    };
    archive.append(JSON.stringify(packageJson, null, 2), {
      name: `${skillFolderName}/package.json`
    });

    // 5. 添加应用配置到 references 目录（供参考）
    // 使用最新发布版本的配置，与 API Key 调用时保持一致
    const appConfig = {
      _id: app._id,
      name: app.name,
      type: app.type,
      avatar: app.avatar,
      intro: app.intro,
      versionId, // 发布版本 ID
      versionName, // 发布版本名称
      modules: nodes, // 使用最新发布版本的 nodes
      edges, // 使用最新发布版本的 edges
      chatConfig, // 使用最新发布版本的 chatConfig
      exportTime: new Date().toISOString()
    };
    archive.append(JSON.stringify(appConfig, null, 2), {
      name: `${skillFolderName}/references/app-config.json`
    });

    // 6. 创建预留目录（保持标准结构）
    archive.append('', { name: `${skillFolderName}/assets/.gitkeep` });

    // 完成压缩
    await archive.finalize();
  } catch (error) {
    addLog.error('Export skill zip failed:', error);
    // 无论响应头是否已发送，都要抛出异常让调用方知道
    if (!res.headersSent) {
      throw new Error(AppErrEnum.exportSkillFailed);
    }
    // 如果响应头已发送，销毁响应流并抛出异常
    res.destroy();
    throw new Error('Export failed after response headers sent');
  }
}
