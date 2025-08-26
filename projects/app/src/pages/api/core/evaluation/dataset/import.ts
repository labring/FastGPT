import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ImportDatasetResponse } from '@fastgpt/global/core/evaluation/api';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return jsonRes(res, {
        code: 405,
        message: 'Method not allowed'
      });
    }

    const upload = getUploadModel({
      maxSize: 20
    });

    const { file } = await upload.getUploadFile(req, res);
    const datasetId = req.body?.datasetId;

    if (!datasetId || !file) {
      return jsonRes(res, {
        code: 400,
        message: 'Missing datasetId or file'
      });
    }

    addLog.info('[Evaluation Dataset] Starting data import', {
      datasetId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype
    });

    const fileContent = fs.readFileSync(file.path);
    const result = await EvaluationDatasetService.importDataFromFile(
      datasetId,
      fileContent,
      file.originalname || '',
      file.mimetype || '',
      {
        req,
        authToken: true
      }
    );

    try {
      fs.unlinkSync(file.path);
    } catch (cleanupError: unknown) {
      addLog.warn(
        '[Evaluation Dataset] Failed to clean up temporary file',
        cleanupError as Record<string, any>
      );
    }

    addLog.info('[Evaluation Dataset] Data import completed', {
      datasetId,
      fileName: file.originalname,
      success: result.success,
      importedCount: result.importedCount,
      errorCount: result.errors?.length || 0
    });

    jsonRes(res, {
      data: result
    });
  } catch (err) {
    addLog.error('[Evaluation Dataset] Failed to import data', {
      error: err,
      datasetId: req.body?.datasetId
    });

    jsonRes(res, {
      code: 500,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
