import { delay } from '@fastgpt/global/common/system/utils';
import axios from 'axios';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = {
  apikey: string;
  files: string[];
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  success: boolean;
  error?: Record<string, any>;
}>;
function processContent(content: string): string {
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

        const separator = '| ' + Array(maxColumns).fill('---').join(' | ') + ' |';
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
        console.error('Table conversion error:', error);
        return htmlTable;
      }
    } catch (error) {
      console.error('Table processing error:', error);
      return htmlTable;
    }
  });
}
const main = async ({ apikey, files }: Props): Response => {
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
      const PDFResponse = await axiosInstance.get(url, { responseType: 'arraybuffer' });
      if (PDFResponse.status !== 200) {
        throw new Error(`Failed to fetch PDF from URL: ${PDFResponse.data}`);
      }

      const contentType = PDFResponse.headers['content-type'];
      const file_name = url.match(/read\/([^?]+)/)?.[1] || 'unknown.pdf';
      if (!contentType || !contentType.startsWith('application/pdf')) {
        throw new Error(`The provided file does not point to a PDF: ${contentType}`);
      }

      const blob = new Blob([PDFResponse.data], { type: 'application/pdf' });
      // Get pre-upload URL first
      const preupload_response = await axiosInstance.post(
        'https://v2.doc2x.noedgeai.com/api/v2/parse/preupload',
        null,
        {
          headers: {
            Authorization: `Bearer ${apikey}`
          }
        }
      );

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

      const response = await axiosInstance.put(upload_url, blob, {
        headers: {
          'Content-Type': 'application/pdf'
        }
      });
      if (response.status !== 200) {
        throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
      }

      // Get the result by uid

      // Wait for the result, at most 90s
      const checkResult = async (retry = 30) => {
        if (retry <= 0)
          return Promise.reject(
            `File:${file_name}\n<Content>\nFailed to get result (uid: ${uid}): Get result timeout\n</Content>`
          );

        try {
          const result_response = await axiosInstance.get(
            `https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=${uid}`,
            {
              headers: {
                Authorization: `Bearer ${apikey}`
              }
            }
          );

          const result_data = result_response.data;
          if (!['ok', 'success'].includes(result_data.code)) {
            return Promise.reject(
              `File:${file_name}\n<Content>\nFailed to get result (uid: ${uid}): ${JSON.stringify(result_data)}\n</Content>`
            );
          }

          if (['ready', 'processing'].includes(result_data.data.status)) {
            await delay(3000);
            return checkResult(retry - 1);
          }

          if (result_data.data.status === 'success') {
            const result = processContent(
              await Promise.all(
                result_data.data.result.pages.map((page: { md: any }) => page.md)
              ).then((pages) => pages.join('\n'))
            )
              // Do some post-processing
              .replace(/\\[\(\)]/g, '$')
              .replace(/\\[\[\]]/g, '$$')
              .replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)')
              .replace(/<!-- Media -->/g, '')
              .replace(/<!-- Footnote -->/g, '');

            return `File:${file_name}\n<Content>\n${result}\n</Content>`;
          }

          await delay(100);
          return checkResult(retry - 1);
        } catch (error) {
          await delay(100);
          return checkResult(retry - 1);
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
