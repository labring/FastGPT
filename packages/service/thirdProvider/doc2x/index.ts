import { batchRun, delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '../../common/system/log';
import { htmlTable2Md } from '@fastgpt/global/common/string/markdown';
import axios, { type Method } from 'axios';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { type ImageType } from '../../worker/readFile/type';
import { getImageBase64 } from '../../common/file/image/utils';

type ApiResponseDataType<T = any> = {
  code: string;
  msg?: string;
  data: T;
};

export const useDoc2xServer = ({ apiKey }: { apiKey: string }) => {
  // Init request
  const instance = axios.create({
    baseURL: 'https://v2.doc2x.noedgeai.com/api',
    timeout: 60000,
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  // Response check
  const checkRes = (data: ApiResponseDataType) => {
    if (data === undefined) {
      addLog.info('[Doc2x] Server data is empty');
      return Promise.reject('服务器异常');
    }
    return data;
  };
  const responseError = (err: any) => {
    if (!err) {
      return Promise.reject({ message: '[Doc2x] Unknown error' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: `[Doc2x] ${err}` });
    }
    if (typeof err.message === 'string') {
      return Promise.reject({ message: `[Doc2x] ${err.message}` });
    }
    if (typeof err.data === 'string') {
      return Promise.reject({ message: `[Doc2x] ${err.data}` });
    }
    if (err?.response?.data) {
      return Promise.reject({ message: `[Doc2x] ${getErrText(err?.response?.data)}` });
    }

    addLog.error('[Doc2x] Unknown error', err);
    return Promise.reject({ message: `[Doc2x] ${getErrText(err)}` });
  };
  const request = <T>(url: string, data: any, method: Method): Promise<ApiResponseDataType<T>> => {
    // Remove empty data
    for (const key in data) {
      if (data[key] === undefined) {
        delete data[key];
      }
    }

    return instance
      .request({
        url,
        method,
        data: ['POST', 'PUT'].includes(method) ? data : undefined,
        params: !['POST', 'PUT'].includes(method) ? data : undefined
      })
      .then((res) => checkRes(res.data))
      .catch((err) => responseError(err));
  };

  const parsePDF = async (fileBuffer: Buffer) => {
    addLog.debug('[Doc2x] PDF parse start');
    const startTime = Date.now();

    // 1. Get pre-upload URL first
    const {
      code,
      msg,
      data: preupload_data
    } = await request<{ uid: string; url: string }>('/v2/parse/preupload', null, 'POST');
    if (!['ok', 'success'].includes(code)) {
      return Promise.reject(`[Doc2x] Failed to get pre-upload URL: ${msg}`);
    }
    const upload_url = preupload_data.url;
    const uid = preupload_data.uid;

    // 2. Upload file to pre-signed URL with binary stream
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    const response = await axios
      .put(upload_url, blob, {
        headers: {
          'Content-Type': 'application/pdf'
        }
      })
      .catch((error) => {
        return Promise.reject(`[Doc2x] Failed to upload file: ${getErrText(error)}`);
      });
    if (response.status !== 200) {
      return Promise.reject(
        `[Doc2x] Upload failed with status ${response.status}: ${response.statusText}`
      );
    }
    addLog.debug(`[Doc2x] Uploaded file success, uid: ${uid}`);

    await delay(5000);

    // 3. Get the result by uid
    const checkResult = async () => {
      // 10 minutes
      let retry = 120;

      while (retry > 0) {
        try {
          const {
            code,
            data: result_data,
            msg
          } = await request<{
            progress: number;
            status: 'processing' | 'failed' | 'success';
            result: {
              pages: {
                md: string;
              }[];
            };
          }>(`/v2/parse/status?uid=${uid}`, null, 'GET');

          // Error
          if (!['ok', 'success'].includes(code)) {
            return Promise.reject(`[Doc2x] Failed to get result (uid: ${uid}): ${msg}`);
          }

          // Process
          if (['ready', 'processing'].includes(result_data.status)) {
            addLog.debug(`[Doc2x] Waiting for the result, uid: ${uid}`);
            await delay(5000);
          }

          // Finifsh
          if (result_data.status === 'success') {
            return {
              text: result_data.result.pages
                .map((page) => page.md)
                .join('')
                .replace(/\\[\(\)]/g, '$')
                .replace(/\\[\[\]]/g, '$$')
                .replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)')
                .replace(/<!-- Media -->/g, '')
                .replace(/<!-- Footnote -->/g, '')
                .replace(/\$(.+?)\s+\\tag\{(.+?)\}\$/g, '$$$1 \\qquad \\qquad ($2)$$')
                .replace(/\\text\{([^}]*?)(\b\w+)_(\w+\b)([^}]*?)\}/g, '\\text{$1$2\\_$3$4}'),
              pages: result_data.result.pages.length
            };
          }
        } catch (error) {
          // Just network error
          addLog.warn(`[Doc2x] Get result error`, { error });
          await delay(500);
        }

        retry--;
      }
      return Promise.reject(`[Doc2x] Failed to get result (uid: ${uid}): Process timeout`);
    };

    const { text, pages } = await checkResult();

    // ![](url) => ![](base64)
    const parseTextImage = async (text: string) => {
      // Extract image links and convert to base64
      const imageList: { id: string; url: string }[] = [];
      let processedText = text.replace(/!\[.*?\]\((http[^)]+)\)/g, (match, url) => {
        const id = `IMAGE_${getNanoid()}_IMAGE`;
        imageList.push({
          id,
          url
        });
        return `![](${id})`;
      });

      // Get base64 from image url
      let resultImageList: ImageType[] = [];
      await batchRun(
        imageList,
        async (item) => {
          try {
            const { base64, mime } = await getImageBase64(item.url);
            resultImageList.push({
              uuid: item.id,
              mime,
              base64
            });
          } catch (error) {
            processedText = processedText.replace(item.id, item.url);
            addLog.warn(`[Doc2x] Failed to get image from ${item.url}: ${getErrText(error)}`);
          }
        },
        5
      );

      return {
        text: processedText,
        imageList: resultImageList
      };
    };
    const { text: formatText, imageList } = await parseTextImage(htmlTable2Md(text));

    // 新增：表格后处理优化
    const enhancedText = enhanceTableProcessing(formatText);

    addLog.debug(`[Doc2x] PDF parse finished`, {
      time: `${Math.round((Date.now() - startTime) / 1000)}s`,
      pages
    });

    return {
      pages,
      text: enhancedText,
      imageList
    };
  };

  // 新增：增强表格处理函数
  const enhanceTableProcessing = (text: string): string => {
    // 1. 修复断行的表格
    let processedText = repairBrokenTables(text);

    // 2. 合并相邻的表格片段
    processedText = mergeAdjacentTableFragments(processedText);

    // 3. 标准化表格格式
    processedText = normalizeTableFormat(processedText);

    return processedText;
  };

  // 修复断行的表格
  const repairBrokenTables = (text: string): string => {
    // 将被意外断行的表格行重新连接
    return text.replace(/\|\s*\n\s*([^|\n]+)\s*\n\s*\|/g, '| $1 |');
  };

  // 合并相邻的表格片段
  const mergeAdjacentTableFragments = (text: string): string => {
    const lines = text.split('\n');
    const processedLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // 检测可能的表格开始
      if (line.includes('|') && line.split('|').length >= 3) {
        const tableLines = [lines[i]];
        let j = i + 1;

        // 收集连续的表格相关行
        while (j < lines.length) {
          const nextLine = lines[j].trim();

          // 如果是表格行或者是可能的数据行
          if (
            nextLine.includes('|') ||
            (nextLine &&
              !nextLine.startsWith('#') &&
              tableLines.length > 0 &&
              isLikelyTableData(nextLine, tableLines[tableLines.length - 1]))
          ) {
            tableLines.push(lines[j]);
            j++;
          } else if (nextLine === '') {
            // 空行，检查下一行是否还是表格
            if (j + 1 < lines.length && lines[j + 1].trim().includes('|')) {
              tableLines.push(lines[j]); // 保留空行
              j++;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        // 处理收集到的表格行
        if (tableLines.length >= 2) {
          const processedTable = reconstructTable(tableLines);
          processedLines.push(processedTable);
        } else {
          processedLines.push(lines[i]);
        }

        i = j;
      } else {
        processedLines.push(lines[i]);
        i++;
      }
    }

    return processedLines.join('\n');
  };

  // 判断是否可能是表格数据
  const isLikelyTableData = (line: string, previousLine: string): boolean => {
    if (!line || !previousLine) return false;

    // 计算前一行的列数
    const prevCols = previousLine.split('|').length - 2;
    if (prevCols <= 0) return false;

    // 检查当前行是否可能是表格数据（通过分隔符推测）
    const possibleDelimiters = [',', '\t', '  ', ' - ', ' | '];
    for (const delimiter of possibleDelimiters) {
      const parts = line.split(delimiter);
      if (parts.length === prevCols && parts.every((part) => part.trim())) {
        return true;
      }
    }

    return false;
  };

  // 重构表格
  const reconstructTable = (tableLines: string[]): string => {
    const cleanLines = tableLines.map((line) => line.trim()).filter(Boolean);
    if (cleanLines.length === 0) return '';

    // 找到第一个有效的表格行来确定列数
    let columnCount = 0;
    let headerLine = '';

    for (const line of cleanLines) {
      if (line.includes('|')) {
        const cols = line.split('|').length - 2;
        if (cols > columnCount) {
          columnCount = cols;
          headerLine = line;
        }
      }
    }

    if (columnCount === 0) return tableLines.join('\n');

    // 重构表格
    const reconstructedLines: string[] = [];
    let hasHeader = false;

    for (const line of cleanLines) {
      if (line.includes('|')) {
        // 标准表格行
        const cells = line.split('|').slice(1, -1);
        while (cells.length < columnCount) cells.push('');
        reconstructedLines.push(`| ${cells.slice(0, columnCount).join(' | ')} |`);

        // 添加分隔行（如果这是第一行）
        if (!hasHeader) {
          reconstructedLines.push(`| ${Array(columnCount).fill('---').join(' | ')} |`);
          hasHeader = true;
        }
      } else if (line && !line.startsWith('#')) {
        // 可能的数据行，尝试转换为表格格式
        const convertedRow = convertToTableRow(line, columnCount);
        if (convertedRow) {
          reconstructedLines.push(convertedRow);
          if (!hasHeader) {
            // 插入分隔行
            reconstructedLines.splice(-1, 0, `| ${Array(columnCount).fill('---').join(' | ')} |`);
            hasHeader = true;
          }
        }
      }
    }

    return reconstructedLines.join('\n');
  };

  // 将普通文本转换为表格行
  const convertToTableRow = (line: string, columnCount: number): string | null => {
    const possibleDelimiters = ['\t', '  ', ',', ' - ', '|'];

    for (const delimiter of possibleDelimiters) {
      const parts = line.split(delimiter).map((part) => part.trim());
      if (parts.length <= columnCount && parts.length > 1 && parts.every((part) => part)) {
        while (parts.length < columnCount) parts.push('');
        return `| ${parts.slice(0, columnCount).join(' | ')} |`;
      }
    }

    return null;
  };

  // 标准化表格格式
  const normalizeTableFormat = (text: string): string => {
    const tableRegex = /(\|[^\n]*\|(?:\n\|[^\n]*\|)*)/g;

    return text.replace(tableRegex, (match) => {
      const lines = match.split('\n').filter((line) => line.trim());
      if (lines.length < 2) return match;

      // 确保有分隔行
      const hasSeperatorLine = lines.some((line) =>
        /^\|\s*[-:]+\s*(\|\s*[-:]+\s*)*\|$/.test(line.trim())
      );

      if (!hasSeperatorLine && lines.length >= 1) {
        const firstLine = lines[0];
        const columnCount = firstLine.split('|').length - 2;
        if (columnCount > 0) {
          const separator = `| ${Array(columnCount).fill('---').join(' | ')} |`;
          lines.splice(1, 0, separator);
        }
      }

      return lines.join('\n');
    });
  };

  return {
    parsePDF
  };
};
