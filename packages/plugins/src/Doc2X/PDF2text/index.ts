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
        throw new Error(
          `File:${url} \n<Content>\nFailed to fetch PDF from URL: ${PDFResponse.statusText}\n</Content>`
        );
      }

      const contentType = PDFResponse.headers['content-type'];
      const file_name = url.match(/read\/([^?]+)/)?.[1] || 'unknown.pdf';
      if (!contentType || !contentType.startsWith('application/pdf')) {
        throw new Error(
          `File:${file_name}\n<Content>\nThe provided file does not point to a PDF: ${contentType}\n</Content>`
        );
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
        throw new Error(
          `File:${file_name}\n<Content>\nFailed to get pre-upload URL: ${preupload_response.statusText}\n</Content>`
        );
      }

      const preupload_data = preupload_response.data;
      if (preupload_data.code !== 'success') {
        throw new Error(
          `File:${file_name}\n<Content>\nFailed to get pre-upload URL: ${JSON.stringify(preupload_data)}\n</Content>`
        );
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
            const result = (
              await Promise.all(
                result_data.data.result.pages.map((page: { md: any }) => page.md)
              ).then((pages) => pages.join('\n'))
            )
              // Do some post-processing
              .replace(/\\[\(\)]/g, '$')
              .replace(/\\[\[\]]/g, '$$')
              .replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)');

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
        `File:${url} \n<Content>\nFailed to fetch image from URL: ${getErrText(error)}\n</Content>`
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
