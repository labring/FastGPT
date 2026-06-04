import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { multer } from '@fastgpt/service/common/file/multer';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { UploadPkgPluginResponseSchema } from '@fastgpt/global/openapi/core/plugin/admin/api';
import fs from 'node:fs';

/* ============================================================================
 * API: 上传系统插件包
 * Route: POST /api/core/plugin/admin/pkg/upload
 * Method: POST
 * Description: 批量上传系统插件 .pkg 文件或包含多个 .pkg 的 .zip 文件，并返回解析后的插件信息
 * Tags: ['Plugin', 'Admin', 'Write']
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

    await authSystemAdmin({ req });

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
      const uploadResult = await pluginClient.uploadPlugin(uploadFiles);
      return jsonRes(res, {
        code: 200,
        data: UploadPkgPluginResponseSchema.parse(uploadResult)
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
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  } finally {
    multer.clearDiskTempFiles(filepaths);
  }
}
