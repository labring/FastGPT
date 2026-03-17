import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { createSkillApiKey } from '@fastgpt/service/support/openapi/tools';
import { exportSkillZip } from '@fastgpt/service/core/app/skill/export';
import SkillErr, { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EndpointUrl } from '@fastgpt/global/common/file/constants';

// 请求体类型定义
type ExportSkillBody = {
  skillName: string;
  skillDescription: string;
  templateType?: 'universal' | 'intelligent' | 'custom';
  customTemplatePath?: string;
  includeAssets?: boolean;
};

async function handler(
  req: ApiRequestProps<ExportSkillBody, { appId: string }>,
  res: NextApiResponse
): Promise<void> {
  const { appId } = req.query;
  const { skillName, skillDescription } = req.body;

  // 从 cookie 中获取语言设置
  const locale = getLocale(req);

  // 1. 参数校验
  if (!appId) {
    return Promise.reject(SkillErr[SkillErrEnum.exportMissingAppId]);
  }

  if (!skillName || !skillDescription) {
    return Promise.reject(SkillErr[SkillErrEnum.exportMissingSkillParams]);
  }

  // 校验 skillName 格式
  const skillNameRegex = /^[a-z0-9-]+$/;
  if (!skillNameRegex.test(skillName)) {
    return Promise.reject(SkillErr[SkillErrEnum.exportInvalidSkillName]);
  }

  // 校验长度
  if (skillName.length > 64) {
    return Promise.reject(SkillErr[SkillErrEnum.exportSkillNameTooLong]);
  }

  if (skillDescription.length > 1024) {
    return Promise.reject(SkillErr[SkillErrEnum.exportSkillDescriptionTooLong]);
  }

  try {
    // 2. 权限验证（需要管理权限）
    const { app, teamId, tmbId } = await authApp({
      req,
      authToken: true,
      appId,
      per: ManagePermissionVal
    });

    // 3. 创建 Skill 专用 API Key
    const { apiKey, keyName, expiredTime } = await createSkillApiKey({
      teamId,
      tmbId,
      appId
    });

    // 4. 获取 baseUrl（从环境变量，避免 Host Header Injection 攻击）
    const baseUrl = EndpointUrl;

    // 5. 生成并流式输出 ZIP
    await exportSkillZip({
      app,
      apiKey,
      keyName,
      expiredTime,
      baseUrl,
      skillName,
      skillDescription,
      locale,
      res
    });

    // 6. 记录审计日志
    // 注意：由于响应已经结束，审计日志需要异步执行
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.EXPORT_APP_AS_SKILL,
        params: {
          appName: app.name,
          appType: getI18nAppType(app.type),
          apiKeyName: keyName,
          skillName
        }
      });
    })();
  } catch (error: any) {
    console.error('Export skill failed:', error);
    if (!res.headersSent) {
      return Promise.reject(SkillErr[SkillErrEnum.exportFailed]);
    } else {
      // 响应头已发送，销毁流以停止传输不完整的数据
      if (!res.destroyed) {
        res.destroy();
      }
      // 注意：此时已无法发送标准错误响应，客户端会收到连接中断
      // 错误详情已通过 console.error 记录
    }
  }
}

export default NextAPI(handler);
