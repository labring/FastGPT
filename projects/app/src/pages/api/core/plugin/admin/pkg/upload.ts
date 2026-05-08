import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { multer } from '@fastgpt/service/common/file/multer';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import { getLocale } from '@fastgpt/service/common/middle/i18n';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const lang = getLocale(req);
  const filepaths: string[] = [];

  try {
    if (req.method !== 'POST') {
      return jsonRes(res, { code: 405, error: 'Method not allowed' });
    }

    await authSystemAdmin({ req });

    const result = await multer.resolveFormData<Record<string, never>>({
      request: req
    });

    filepaths.push(result.fileMetadata.path);

    const fileBuffer = result.getBuffer();
    const filename = decodeURIComponent(result.fileMetadata.originalname || 'plugin.pkg');
    const file = new Blob([new Uint8Array(fileBuffer)], {
      type: result.fileMetadata.mimetype
    });

    try {
      const uploadResult = await pluginClient.uploadPlugin(file, filename);
      return jsonRes(res, {
        code: 200,
        data: uploadResult
      });
    } catch (error: any) {
      return jsonRes(res, {
        code: 400,
        error: error.message ? parseI18nString(JSON.parse(error.message)['reason'], lang) : error
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
