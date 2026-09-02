import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { multer } from '@fastgpt/service/common/file/multer';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { UploadTeamPkgPluginResponseSchema } from '@fastgpt/global/openapi/core/plugin/team/pkg/api';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import fs from 'node:fs';
import { getTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';
import { assertTeamPluginInstallEnabled } from '@fastgpt/service/core/plugin/teamPluginPolicy';

/* ============================================================================
 * API: 上传团队插件包
 * Route: POST /api/core/plugin/team/pkg/upload
 * Method: POST
 * Description: 上传 .pkg 或 .zip 并解析待安装插件，确认前不写入团队插件库
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const config = {
  api: {
    bodyParser: false
  }
};

const parseUploadError = (error: unknown, lang: string) => {
  if (!(error instanceof Error)) return error;

  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.reason) {
      return parseI18nString(parsed.reason, lang) || error.message;
    }
  } catch {
    return error.message;
  }

  return error.message;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const lang = getLocale(req);
  const filepaths: string[] = [];

  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }
    assertTeamPluginInstallEnabled();

    const { teamId } = await authUserPer({
      req,
      authToken: true,
      per: TeamManagePermissionVal
    });

    const result = await multer.resolveMultipleFormData<Record<string, never>>({
      request: req,
      maxFileSize: global.feConfigs.uploadFileMaxSize,
      allowedExtensions: ['.pkg', '.zip']
    });

    filepaths.push(...result.fileMetadata.map((file) => file.path));

    const uploadFiles = result.fileMetadata.map((fileMetadata, index) => {
      const fileBuffer = new Uint8Array(fs.readFileSync(fileMetadata.path));
      return {
        file: new Blob([fileBuffer], {
          type: fileMetadata.mimetype
        }),
        filename: decodeURIComponent(fileMetadata.originalname || `plugin-${index}.pkg`)
      };
    });

    try {
      const uploadResult = await pluginClient.uploadPlugin(uploadFiles, {
        source: getTeamPluginSource(teamId)
      });
      return jsonRes(res, {
        code: 200,
        data: UploadTeamPkgPluginResponseSchema.parse(uploadResult)
      });
    } catch (error: any) {
      return jsonRes(res, {
        code: 400,
        error: parseUploadError(error, lang)
      });
    }
  } catch (error: unknown) {
    return jsonRes(res, {
      code: 500,
      error: error instanceof Error ? error.message : error
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}
