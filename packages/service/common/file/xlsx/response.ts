import type { ServerResponse } from 'node:http';
import { XLSX_CONTENT_TYPE } from '@fastgpt/global/common/file/constants';
import { getContentDisposition } from '@fastgpt/global/common/file/tools';
import { writeXlsx, type Worksheet } from '@fastgpt/global/common/file/xlsx/write-xlsx';

/** 为已就绪的 XLSX 下载设置附件响应头。 */
export function setXlsxDownloadHeaders(res: ServerResponse, filename: string): void {
  if (res.destroyed) throw new Error('XLSX download connection closed');
  res.setHeader('Content-Type', XLSX_CONTENT_TYPE);
  res.setHeader('Content-Disposition', getContentDisposition({ filename, type: 'attachment' }));
}

/** 通过现有下载响应发送单工作表 XLSX。 */
export async function writeXlsxResponse({
  res,
  filename,
  sheet
}: {
  res: ServerResponse;
  filename: string;
  sheet: Worksheet;
}): Promise<void> {
  setXlsxDownloadHeaders(res, filename);
  await writeXlsx({ sheets: [sheet], destination: res });
}
