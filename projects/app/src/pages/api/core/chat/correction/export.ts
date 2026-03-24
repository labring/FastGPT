import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoChatCorrection } from '@fastgpt/service/core/chat/correction/schema';
import { CorrectionModeEnum } from '@fastgpt/global/core/chat/correction/constants';
import type { ExportChatCorrectionParams } from '@fastgpt/global/core/chat/correction/api';
import ExcelJS from 'exceljs';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const { appId, startTime, endTime, colHeaders } = req.body as ExportChatCorrectionParams;

  await authChatCrud({
    req,
    authToken: true,
    appId
  });

  const query: Record<string, any> = { appId };
  if (startTime || endTime) {
    query.updateTime = {
      ...(startTime && { $gte: new Date(startTime) }),
      ...(endTime && { $lte: new Date(endTime) })
    };
  }

  const corrections = await MongoChatCorrection.find(query)
    .sort({ updateTime: -1 })
    .limit(50000)
    .lean();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  worksheet.columns = [{ width: 40 }, { width: 60 }, { width: 60 }];

  const headerRow = worksheet.addRow(colHeaders);
  headerRow.font = { bold: true };

  for (const correction of corrections) {
    const { correctionData } = correction;
    let answer = '';
    let indexes = '';

    if (correctionData.correctionMode === CorrectionModeEnum.edit) {
      answer = correctionData.correctedAnswer || '';
    } else if (correctionData.correctionMode === CorrectionModeEnum.annotate) {
      const quoteList = (correctionData.correctedQuoteList || []).filter((q) => q.a);
      answer = quoteList.map((q) => q.a).join('\n');
      indexes = quoteList.map((q) => q.q).join('\n');
    }

    if (!answer) continue;

    worksheet.addRow([correctionData.question || '', answer, indexes]);
  }

  const buffer = await workbook.xlsx.writeBuffer();

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename=optimization-records.xlsx');
  res.send(buffer);
}

export default NextAPI(handler);
