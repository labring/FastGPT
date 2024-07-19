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
}>;

const main = async ({ apikey, url, img_correction, formula }: Props): Response => {
  // Check the apikey
  if (!apikey) {
    return {
      result: `API key is required`
    };
  }
  let real_api_key = apikey;
  if (!apikey.startsWith('sk-')) {
    const response = await fetch('https://api.doc2x.noedgeai.com/api/token/refresh', {
      headers: {
        Authorization: `Bearer ${apikey}`
      }
    });
    if (response.status !== 200) {
      return {
        result: `Get token failed: ${response.text()}`
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
  }
  if (mini === '') {
    return {
      result: `Not supported image format, only support jpg/jpeg/png`
    };
  }
  const response = await fetch(url);
  if (!response.ok) {
    return {
      result: `Failed to fetch image from URL: ${url}`
    };
  }
  const blob = await response.blob();
  const formData = new FormData();
  // formData.append('file', blob, 'image.' + extension);
  formData.append('file', new Blob([blob], { type: mini }), name + '.' + extension);
  formData.append('img_correction', img_correction ? '1' : '0');
  formData.append('equation', formula ? '1' : '0');

  let upload_url = 'https://api.doc2x.noedgeai.com/api/platform/async/img';
  if (real_api_key.startsWith('sk-')) {
    upload_url = 'https://api.doc2x.noedgeai.com/api/v1/async/img';
  }

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
        result: `Failed to upload image: ${upload_response.text()}`
      };
    }
    if (upload_response.status === 429) {
      // Rate limit, wait for 10s and retry at most 3 times
      await delay(10000);
      continue;
    }
    const upload_data = await upload_response.json();
    const uuid = upload_data.data.uuid;
    break;
  }

  return {
    result: `result: "test",`
  };
};

export default main;
