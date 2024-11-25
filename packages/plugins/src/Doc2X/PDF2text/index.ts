import { delay } from '@fastgpt/global/common/system/utils';
import axios from 'axios';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = {
  apikey: string;
  HTMLtable: boolean;
  files: string[];
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  success: boolean;
  error?: Record<string, any>;
}>;

function processContent(content: string, HTMLtable: boolean): string {
  if (HTMLtable) {
    return content;
  }
  return content.replace(/<table>[\s\S]*?<\/table>/g, (htmlTable) => {
    try {
      // Clean up whitespace and newlines
      const cleanHtml = htmlTable.replace(/\n\s*/g, '');
      const rows = cleanHtml.match(/<tr>(.*?)<\/tr>/g);
      if (!rows) return htmlTable;

      // Parse table data
      let tableData: string[][] = [];
      let maxColumns = 0;

      // Try to convert to markdown table
      try {
        rows.forEach((row, rowIndex) => {
          if (!tableData[rowIndex]) {
            tableData[rowIndex] = [];
          }
          let colIndex = 0;
          const cells = row.match(/<td.*?>(.*?)<\/td>/g) || [];

          cells.forEach((cell) => {
            while (tableData[rowIndex][colIndex]) {
              colIndex++;
            }
            const colspan = parseInt(cell.match(/colspan="(\d+)"/)?.[1] || '1');
            const rowspan = parseInt(cell.match(/rowspan="(\d+)"/)?.[1] || '1');
            const content = cell.replace(/<td.*?>|<\/td>/g, '').trim();

            for (let i = 0; i < rowspan; i++) {
              for (let j = 0; j < colspan; j++) {
                if (!tableData[rowIndex + i]) {
                  tableData[rowIndex + i] = [];
                }
                tableData[rowIndex + i][colIndex + j] = i === 0 && j === 0 ? content : '^^';
              }
            }
            colIndex += colspan;
            maxColumns = Math.max(maxColumns, colIndex);
          });

          for (let i = 0; i < maxColumns; i++) {
            if (!tableData[rowIndex][i]) {
              tableData[rowIndex][i] = ' ';
            }
          }
        });
        const chunks: string[] = [];

        const headerCells = tableData[0]
          .slice(0, maxColumns)
          .map((cell) => (cell === '^^' ? ' ' : cell || ' '));
        const headerRow = '| ' + headerCells.join(' | ') + ' |';
        chunks.push(headerRow);

        const separator = '| ' + Array(headerCells.length).fill('---').join(' | ') + ' |';
        chunks.push(separator);

        tableData.slice(1).forEach((row) => {
          const paddedRow = row
            .slice(0, maxColumns)
            .map((cell) => (cell === '^^' ? ' ' : cell || ' '));
          while (paddedRow.length < maxColumns) {
            paddedRow.push(' ');
          }
          chunks.push('| ' + paddedRow.join(' | ') + ' |');
        });

        return chunks.join('\n');
      } catch (error) {
        return htmlTable;
      }
    } catch (error) {
      return htmlTable;
    }
  });
}

const main = async ({ apikey, files, HTMLtable }: Props): Response => {
  // Check the apikey
  if (!apikey) {
    return Promise.reject(`API key is required`);
  }
  const successResult = [];
  const failedResult = [];

  const axiosInstance = axios.create({
    timeout: 30000 // 30 seconds timeout
  });

  //Process each file one by one
  for await (const url of files) {
    try {
      //Fetch the pdf and check its content type
      const PDFResponse = await axios
        .get(url, {
          responseType: 'arraybuffer',
          proxy: false,
          timeout: 20000
        })
        .catch((error) => {
          throw new Error(`[Fetch PDF Error] Failed to fetch PDF: ${getErrText(error)}`);
        });

      if (PDFResponse.status !== 200) {
        throw new Error(
          `[Fetch PDF Error] Failed with status ${PDFResponse.status}: ${PDFResponse.data}`
        );
      }

      const contentType = PDFResponse.headers['content-type'];
      const file_name = url.match(/read\/([^?]+)/)?.[1] || 'unknown.pdf';
      if (!contentType || !contentType.startsWith('application/pdf')) {
        throw new Error(`The provided file does not point to a PDF: ${contentType}`);
      }

      const blob = new Blob([PDFResponse.data], { type: 'application/pdf' });
      // Get pre-upload URL first
      const preupload_response = await axiosInstance
        .post('https://v2.doc2x.noedgeai.com/api/v2/parse/preupload', null, {
          headers: {
            Authorization: `Bearer ${apikey}`
          }
        })
        .catch((error) => {
          throw new Error(`[Pre-upload Error] Failed to get pre-upload URL: ${getErrText(error)}`);
        });

      if (preupload_response.status !== 200) {
        throw new Error(`Failed to get pre-upload URL: ${preupload_response.data}`);
      }

      const preupload_data = preupload_response.data;
      if (preupload_data.code !== 'success') {
        throw new Error(`Failed to get pre-upload URL: ${JSON.stringify(preupload_data)}`);
      }

      const upload_url = preupload_data.data.url;
      const uid = preupload_data.data.uid;
      // Upload file to pre-signed URL with binary stream

      const response = await axiosInstance
        .put(upload_url, blob, {
          headers: {
            'Content-Type': 'application/pdf'
          }
        })
        .catch((error) => {
          throw new Error(`[Upload Error] Failed to upload file: ${getErrText(error)}`);
        });

      if (response.status !== 200) {
        throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
      }

      // Get the result by uid

      // Wait for the result
      const checkResult = async (retry = 20) => {
        if (retry <= 0)
          return Promise.reject(
            `File:${file_name}\n<Content>\n[Parse Timeout Error] Failed to get result (uid: ${uid}): Process timeout\n</Content>`
          );

        try {
          const result_response = await axiosInstance
            .get(`https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=${uid}`, {
              headers: {
                Authorization: `Bearer ${apikey}`
              }
            })
            .catch((error) => {
              throw new Error(
                `[Parse Status Error] Failed to get parse status: ${getErrText(error)}`
              );
            });

          const result_data = result_response.data;
          if (!['ok', 'success'].includes(result_data.code)) {
            return Promise.reject(
              `File:${file_name}\n<Content>\nFailed to get result (uid: ${uid}): ${JSON.stringify(result_data)}\n</Content>`
            );
          }

          if (['ready', 'processing'].includes(result_data.data.status)) {
            await delay(4000);
            return checkResult(retry - 1);
          }

          if (result_data.data.status === 'success') {
            const result = processContent(
              await Promise.all(
                result_data.data.result.pages.map((page: { md: any }) => page.md)
              ).then((pages) => pages.join('\n')),
              HTMLtable
            )
              // Do some post-processing
              .replace(/\\[\(\)]/g, '$')
              .replace(/\\[\[\]]/g, '$$')
              .replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)')
              .replace(/<!-- Media -->/g, '')
              .replace(/<!-- Footnote -->/g, '')
              .replace(/\$(.+?)\s+\\tag\{(.+?)\}\$/g, '$$$1 \\qquad \\qquad ($2)$$')
              .replace(/\\text\{([^}]*?)(\b\w+)_(\w+\b)([^}]*?)\}/g, '\\text{$1$2\\_$3$4}');

            return `File:${file_name}\n<Content>\n${result}\n</Content>`;
          }
          return checkResult(retry - 1);
        } catch (error) {
          if (retry > 1) {
            await delay(100);
            return checkResult(retry - 1);
          }
          throw error;
        }
      };

      const result = await checkResult();
      successResult.push(result);
    } catch (error) {
      failedResult.push(
        `File:${url} \n<Content>\nFailed to fetch file from URL: ${getErrText(error)}\n</Content>`
      );
    }
  }

  return {
    result: successResult.join('\n******\n'),
    error: {
      message: failedResult.join('\n******\n')
    },
    success: failedResult.length === 0
  };
};

export default main;
