import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '@fastgpt/service/common/system/log';

type Props = {
  apikey: string;
  files: Array<string>;
  img_correction: boolean;
  formula: boolean;
};

type Response = Promise<{
  result: string;
  failreason: string;
  success: boolean;
}>;

const main = async ({ apikey, files, img_correction, formula }: Props): Response => {
  // Check the apikey
  if (!apikey) {
    return {
      result: '',
      failreason: `API key is required`,
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
        result: '',
        failreason: `Get token failed: ${await response.text()}`,
        success: false
      };
    }
    const data = await response.json();
    real_api_key = data.data.token;
  }

  let final_result = '';
  let fail_reason = '';
  let flag = false;
  //Process each file one by one
  for await (const url of files) {
    // Fetch the image and check its content type
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      fail_reason += `\n---\nFile:${url} \n<Content>\nFailed to fetch image from URL\n</Content>\n`;
      flag = true;
      continue;
    }

    const contentType = imageResponse.headers.get('content-type');
    const fileName = url.match(/read\?filename=([^&]+)/)?.[1] || 'unknown.png';
    if (!contentType || !contentType.startsWith('image/')) {
      fail_reason += `\n---\nFile:${url} \n<Content>\nThe provided URL does not point to an image: ${contentType}\n</Content>\n`;
      flag = true;
      continue;
    }

    const blob = await imageResponse.blob();
    const formData = new FormData();
    formData.append('file', blob, fileName);
    formData.append('img_correction', img_correction ? '1' : '0');
    formData.append('equation', formula ? '1' : '0');

    let upload_url = 'https://api.doc2x.noedgeai.com/api/platform/async/img';
    if (real_api_key.startsWith('sk-')) {
      upload_url = 'https://api.doc2x.noedgeai.com/api/v1/async/img';
    }

    let uuid;
    let upload_flag = true;
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
        fail_reason += `\n---\nFile:${fileName}\n<Content>\nFailed to upload file: ${await upload_response.text()}\n</Content>\n`;
        flag = true;
        upload_flag = false;
        break;
      }
      if (!upload_flag) {
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

    let required_flag = true;
    const maxAttempts = 100;
    // Wait for the result, at most 100s
    for await (const _ of Array(maxAttempts).keys()) {
      const result_response = await fetch(result_url, {
        headers: {
          Authorization: `Bearer ${real_api_key}`
        }
      });
      if (!result_response.ok) {
        fail_reason += `\n---\nFile:${fileName}\n<Content>\nFailed to get result: ${await result_response.text()}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }
      const result_data = await result_response.json();
      if (['ready', 'processing'].includes(result_data.data.status)) {
        await delay(1000);
      } else if (result_data.data.status === 'pages limit exceeded') {
        fail_reason += `\n---\nFile:${fileName}\n<Content>\nFailed to get result: pages limit exceeded\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      } else if (result_data.data.status === 'success') {
        let result;
        try {
          result = result_data.data.result.pages[0].md;
          result = result.replace(/\\[\(\)]/g, '$').replace(/\\[\[\]]/g, '$$');
        } catch {
          // no pages
          final_result += `\n---\nFile:${fileName}\n<Content>\n \n</Content>\n`;
          required_flag = false;
        }
        final_result += `\n---\nFile:${fileName}\n<Content>\n${result}\n</Content>\n`;
        required_flag = false;
        break;
      } else {
        fail_reason += `\n---\nFile:${fileName}\n<Content>\nFailed to get result: ${result_data.data.status}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }
    }
    if (required_flag) {
      fail_reason += `\n---\nFile:${fileName}\n<Content>\nTimeout waiting for result\n</Content>\n`;
      flag = true;
    }
  }

  return {
    result: final_result,
    failreason: fail_reason,
    success: !flag
  };
};

export default main;
