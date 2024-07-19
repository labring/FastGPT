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

  //Get the image binary from the URL
  const formData = new FormData();
  formData.append('pdf_url', url);
  formData.append('ocr', ocr ? '1' : '0');

  let upload_url = 'https://api.doc2x.noedgeai.com/api/platform/async/pdf';
  if (real_api_key.startsWith('sk-')) {
    upload_url = 'https://api.doc2x.noedgeai.com/api/v1/async/pdf';
  }
  let uuid;
  for (let i = 0; i < 3; i++) {
    const upload_response = await fetch(upload_url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${real_api_key}`
      },
      body: formData
    });
    if (!upload_response.ok) {
      return {
        result: `Failed to upload file: ${await upload_response.text()}`,
        success: false
      };
    }
    if (upload_response.status === 429) {
      // Rate limit, wait for 10s and retry at most 3 times
      await delay(10000);
      continue;
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

  let result_response;
  let result_data;
  let result = '';
  // Wait for the result, at most 100s
  for (let i = 0; i < 100; i++) {
    result_response = await fetch(result_url, {
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
    result_data = await result_response.json();
    if (result_data.data.status === 'ready' || result_data.data.status === 'processing') {
      await delay(1000);
    } else if (result_data.data.status === 'pages limit exceeded') {
      return {
        result: 'Doc2X Pages limit exceeded',
        success: false
      };
    } else if (result_data.data.status === 'success') {
      const data = result_data.data.result.pages;
      for (const page of data) {
        result += page.md;
        result += '\n';
      }
      break;
    } else {
      return {
        result: `Failed to get result: ${await result_data.text()}`,
        success: false
      };
    }
  }
  //As fastGPT only supports $ for math, we need to replace the latex symbols
  result = result.replace(/\\[\(\)]/g, '$');
  result = result.replace(/\\[\[\]]/g, '$$');
  return {
    result: result,
    success: true
  };
};

export default main;
