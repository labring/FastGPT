import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '@fastgpt/service/common/system/log';

type Props = {
  apikey: string;
  url: string;
  img_correction: boolean;
  formula: boolean;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  success: boolean;
}>;

const main = async ({ apikey, url, img_correction, formula }: Props): Response => {
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
  const extension = url.split('.').pop()?.toLowerCase();
  const name = url.split('/').pop()?.split('.').shift();
  let mini = '';
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      mini = 'image/jpeg';
      break;
    case 'png':
      mini = 'image/png';
      break;
    default:
      return {
        result: `Not supported image format, only support jpg/jpeg/png`,
        success: false
      };
  }

  const response = await fetch(url);
  if (!response.ok) {
    return {
      result: `Failed to fetch image from URL: ${url}`,
      success: false
    };
  }

  const blob = await response.blob();
  const formData = new FormData();
  formData.append('file', new Blob([blob], { type: mini }), name + '.' + extension);
  formData.append('img_correction', img_correction ? '1' : '0');
  formData.append('equation', formula ? '1' : '0');

  let upload_url = 'https://api.doc2x.noedgeai.com/api/platform/async/img';
  if (real_api_key.startsWith('sk-')) {
    upload_url = 'https://api.doc2x.noedgeai.com/api/v1/async/img';
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
      // Rate limit, wait for 10s and retry at most 3 times
      if (upload_response.status === 429 && attempt < 3) {
        await delay(10000);
        continue;
      }
      return {
        result: `Failed to upload image: ${await upload_response.text()}`,
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
  const maxAttempts = 100;
  // Wait for the result, at most 100s
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
      let result = result_data.data.result.pages[0].md;
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
