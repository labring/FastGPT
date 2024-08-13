import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { result } from 'lodash';

type Props = {
  apikey: string;
  files: Array<string>;
  ocr: boolean;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  failreason: string;
  success: boolean;
}>;

const main = async ({ apikey, files, ocr }: Props): Response => {
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
    //Fetch the pdf and check its contene type
    const PDFResponse = await fetch(url);
    if (!PDFResponse.ok) {
      fail_reason += `\n---\nFile:${url} \n<Content>\nFailed to fetch PDF from URL\n</Content>\n`;
      flag = true;
      continue;
    }

    const contentType = PDFResponse.headers.get('content-type');
    const file_name = url.match(/read\?filename=([^&]+)/)?.[1] || 'unknown.pdf';
    if (!contentType || !contentType.startsWith('application/pdf')) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nThe provided file does not point to a PDF: ${contentType}\n</Content>\n`;
      flag = true;
      continue;
    }

    const blob = await PDFResponse.blob();
    const formData = new FormData();
    formData.append('file', blob, file_name);
    formData.append('ocr', ocr ? '1' : '0');

    let upload_url = 'https://api.doc2x.noedgeai.com/api/platform/async/pdf';
    if (real_api_key.startsWith('sk-')) {
      upload_url = 'https://api.doc2x.noedgeai.com/api/v1/async/pdf';
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
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to upload file: ${await upload_response.text()}\n</Content>\n`;
        flag = true;
        upload_flag = false;
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
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get result: ${await result_response.text()}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }
      const result_data = await result_response.json();
      if (['ready', 'processing'].includes(result_data.data.status)) {
        await delay(1000);
      } else if (result_data.data.status === 'pages limit exceeded') {
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nPages limit exceeded\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      } else if (result_data.data.status === 'success') {
        result = await Promise.all(
          result_data.data.result.pages.map((page: { md: any }) => page.md)
        ).then((pages) => pages.join('\n'));
        result = result.replace(/\\[\(\)]/g, '$').replace(/\\[\[\]]/g, '$$');
        final_result += `\n---\nFile:${file_name}\n<Content>\n${result}\n</Content>\n`;
        required_flag = false;
        break;
      } else {
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get result: ${result_data.data.status}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }
    }
    if (required_flag) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nTimeout after 100s for uuid ${uuid}\n</Content>\n`;
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
