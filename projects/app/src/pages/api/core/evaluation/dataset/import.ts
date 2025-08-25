import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { addLog } from '@fastgpt/service/common/system/log';
import type { ImportDatasetResponse } from '@fastgpt/global/core/evaluation/api';
import fs from 'fs';
import Papa from 'papaparse';

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
      maxSize: 20 // 20MB
    });

    const { file } = await upload.getUploadFile(req, res);
    const datasetId = req.body?.datasetId;

    if (!datasetId || !file) {
      return jsonRes(res, {
        code: 400,
        message: 'Missing datasetId or file'
      });
    }

    addLog.info('[Evaluation Dataset] 开始导入数据', {
      datasetId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype
    });

    // 读取并解析文件内容
    const fileContent = fs.readFileSync(file.path);
    let parsedData: any[];

    if (file.mimetype === 'application/json' || file.originalname?.endsWith('.json')) {
      try {
        const jsonContent = fileContent.toString('utf-8');
        parsedData = JSON.parse(jsonContent);

        if (!Array.isArray(parsedData)) {
          throw new Error('JSON file must contain an array of objects');
        }
      } catch (error) {
        throw new Error(
          `Invalid JSON format: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if (
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      file.originalname?.endsWith('.csv')
    ) {
      try {
        const csvContent = fileContent.toString('utf-8');

        // 使用 Papa Parse 进行更可靠的CSV解析
        const parseResult = Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          transform: (value: string) => {
            // 尝试转换数据类型
            if (value === '') return null;
            if (value === 'true') return true;
            if (value === 'false') return false;

            const num = Number(value);
            if (!isNaN(num) && value.trim() !== '') {
              return num;
            }

            return value;
          }
        });

        if (parseResult.errors.length > 0) {
          const errorMessages = parseResult.errors.map(
            (err: any) => `Row ${err.row}: ${err.message}`
          );
          throw new Error(`CSV parsing errors: ${errorMessages.join('; ')}`);
        }

        parsedData = parseResult.data;

        if (parsedData.length === 0) {
          throw new Error('CSV file contains no data rows');
        }
      } catch (error) {
        throw new Error(
          `Invalid CSV format: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      throw new Error('Unsupported file format. Only JSON and CSV files are supported.');
    }

    // 验证数据不为空
    if (!parsedData || parsedData.length === 0) {
      throw new Error('File contains no data');
    }

    // 导入数据
    const result = await EvaluationDatasetService.importData(datasetId, parsedData, {
      req,
      authToken: true
    });

    // 清理临时文件
    try {
      fs.unlinkSync(file.path);
    } catch (cleanupError: unknown) {
      addLog.warn('[Evaluation Dataset] 临时文件清理失败', cleanupError as Record<string, any>);
    }

    addLog.info('[Evaluation Dataset] 数据导入完成', {
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
    addLog.error('[Evaluation Dataset] 数据导入失败', {
      error: err,
      datasetId: req.body?.datasetId
    });

    jsonRes(res, {
      code: 500,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
