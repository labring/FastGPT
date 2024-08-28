import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '@fastgpt/service/common/system/log';

type Props = {
  apikey: string;
  url: string;
  ocr: boolean;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  success: boolean;
}>;

const main = async ({ apikey, url, ocr }: Props): Response => {
  // Check the apikey
  if (!apikey) {
    return {
      result: `API key is required`,
      success: false
    };
  }

  let real_api_key = apikey;
  if (!apikey.startsWith('sk-')) {
    const response = await fetch('https://api.doc2x.noedgeai.com/api/token/refresh', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apikey}`
      }
    });
    if (response.status !== 200) {
      return {
        result: `Get token failed: ${await response.text()}`,
        success: false
      };
    }
    const data = await response.json();
    real_api_key = data.data.token;
  }

  //Fetch the pdf and check its contene type
  let PDFResponse;
  try {
    PDFResponse = await fetch(url);
  } catch (e) {
    return {
      result: `Failed to fetch PDF from URL: ${url} with error: ${e}`,
      success: false
    };
  }
  if (!PDFResponse.ok) {
    return {
      result: `Failed to fetch PDF from URL: ${url}`,
      success: false
    };
  }

  const contentType = PDFResponse.headers.get('content-type');
  if (!contentType || !contentType.startsWith('application/pdf')) {
    return {
      result: `The provided URL does not point to a PDF: ${contentType}`,
      success: false
    };
  }

  const blob = await PDFResponse.blob();
  const formData = new FormData();
  const fileName = url.split('/').pop()?.split('?')[0] || 'pdf';
  formData.append('file', blob, fileName);
  formData.append('ocr', ocr ? '1' : '0');

  let upload_url = 'https://api.doc2x.noedgeai.com/api/platform/async/pdf';
  if (real_api_key.startsWith('sk-')) {
    upload_url = 'https://api.doc2x.noedgeai.com/api/v1/async/pdf';
  }

  let uuid;
  const uploadAttempts = [1, 2, 3];
  for await (const attempt of uploadAttempts) {
    const upload_response = await fetch(upload_url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${real_api_key}`
      },
      body: formData
    });
    if (!upload_response.ok) {
      if (upload_response.status === 429 && attempt < 3) {
        await delay(10000);
        continue;
      }
      return {
        result: `Failed to upload file: ${await upload_response.text()}`,
        success: false
      };
    }
    const upload_data = await upload_response.json();
    uuid = upload_data.data.uuid;
    break;
  }

  // Get the result by uuid
  let result_url = 'https://api.doc2x.noedgeai.com/api/platform/async/status?uuid=' + uuid;
  if (real_api_key.startsWith('sk-')) {
    result_url = 'https://api.doc2x.noedgeai.com/api/v1/async/status?uuid=' + uuid;
  }

  let result = '';
  // Wait for the result, at most 100s
  const maxAttempts = 100;
  for await (const _ of Array(maxAttempts).keys()) {
    const result_response = await fetch(result_url, {
      headers: {
        Authorization: `Bearer ${real_api_key}`
      }
    });
    if (!result_response.ok) {
      return {
        result: `Failed to get result: ${await result_response.text()}`,
        success: false
      };
    }
    const result_data = await result_response.json();
    if (['ready', 'processing'].includes(result_data.data.status)) {
      await delay(1000);
    } else if (result_data.data.status === 'pages limit exceeded') {
      return {
        result: 'Doc2X Pages limit exceeded',
        success: false
      };
    } else if (result_data.data.status === 'success') {
      result = await Promise.all(
        result_data.data.result.pages.map((page: { md: any }) => page.md)
      ).then((pages) => pages.join('\n'));
      result = result.replace(/\\[\(\)]/g, '$').replace(/\\[\[\]]/g, '$$');
      return {
        result: result,
        success: true
      };
    } else {
      return {
        result: `Failed to get result: ${await result_data.text()}`,
        success: false
      };
    }
  }

  return {
    result: 'Timeout waiting for result',
    success: false
  };
};

export default main;
