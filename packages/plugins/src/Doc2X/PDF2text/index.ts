import { delay } from '@fastgpt/global/common/system/utils';
import axios from 'axios';
import { addLog } from '@fastgpt/service/common/system/log';
import { result } from 'lodash';

type Props = {
  apikey: string;
  files: any;
  ocr: boolean;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
  failreason: string;
  success: boolean;
}>;

const main = async ({ apikey, files }: Props): Response => {
  // Check the apikey
  if (!apikey) {
    return {
      result: '',
      failreason: `API key is required`,
      success: false
    };
  }
  let final_result = '';
  let fail_reason = '';
  let flag = false;
  //Convert the String to Array<String> or String
  let All_URL: Array<string>;
  try {
    const parsed = JSON.parse(files);
    if (Array.isArray(parsed)) {
      All_URL = parsed;
    } else {
      All_URL = [String(parsed)];
    }
  } catch (e) {
    // Set it as String
    All_URL = [String(files)];
  }
  const axiosInstance = axios.create({
    timeout: 30000 // 30 seconds timeout
  });

  //Process each file one by one
  for await (const url of All_URL) {
    //Fetch the pdf and check its content type
    let PDFResponse;
    try {
      PDFResponse = await axiosInstance.get(url, { responseType: 'arraybuffer' });
    } catch (e) {
      fail_reason += `\n---\nFile:${url} \n<Content>\nFailed to fetch image from URL: ${e}\n</Content>\n`;
      flag = true;
      continue;
    }
    if (PDFResponse.status !== 200) {
      fail_reason += `\n---\nFile:${url} \n<Content>\nFailed to fetch PDF from URL: ${PDFResponse.statusText}\n</Content>\n`;
      flag = true;
      continue;
    }

    const contentType = PDFResponse.headers['content-type'];
    const file_name = url.match(/read\/([^?]+)/)?.[1] || 'unknown.pdf';
    if (!contentType || !contentType.startsWith('application/pdf')) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nThe provided file does not point to a PDF: ${contentType}\n</Content>\n`;
      flag = true;
      continue;
    }
    const blob = new Blob([PDFResponse.data], { type: 'application/pdf' });

    // Get pre-upload URL first
    let preupload_url = 'https://v2.doc2x.noedgeai.com/api/v2/parse/preupload';
    let preupload_response;
    try {
      preupload_response = await axiosInstance.post(preupload_url, null, {
        headers: {
          Authorization: `Bearer ${apikey}`
        }
      });
    } catch (e) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get pre-upload URL: ${e}\n</Content>\n`;
      flag = true;
      continue;
    }

    if (preupload_response.status !== 200) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get pre-upload URL: ${preupload_response.statusText}\n</Content>\n`;
      flag = true;
      continue;
    }

    const preupload_data = preupload_response.data;
    if (preupload_data.code !== 'success') {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get pre-upload URL: ${JSON.stringify(preupload_data)}\n</Content>\n`;
      flag = true;
      continue;
    }

    const upload_url = preupload_data.data.url;
    const uid = preupload_data.data.uid;
    // Upload file to pre-signed URL with binary stream
    try {
      const response = await axiosInstance.put(upload_url, blob, {
        headers: {
          'Content-Type': 'application/pdf'
        }
      });
      if (response.status !== 200) {
        throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
      }
    } catch (e) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to upload file (uid: ${uid}): ${e}\n</Content>\n`;
      flag = true;
      continue;
    }

    // Get the result by uid
    const result_url = `https://v2.doc2x.noedgeai.com/api/v2/parse/status?uid=${uid}`;
    let required_flag = true;
    let result = '';

    // Wait for the result, at most 90s
    const maxAttempts = 30;
    for await (const _ of Array(maxAttempts).keys()) {
      let result_response;
      try {
        result_response = await axiosInstance.get(result_url, {
          headers: {
            Authorization: `Bearer ${apikey}`
          }
        });
      } catch (e) {
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get result (uid: ${uid}): ${e}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }

      const result_data = result_response.data;
      if (!['ok', 'success'].includes(result_data.code)) {
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get result (uid: ${uid}): ${JSON.stringify(result_data)}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }
      if (['ready', 'processing'].includes(result_data.data.status)) {
        await delay(3000);
      } else if (result_data.data.status === 'success') {
        result = await Promise.all(
          result_data.data.result.pages.map((page: { md: any }) => page.md)
        ).then((pages) => pages.join('\n'));
        // Do some post-processing
        result = result.replace(/\\[\(\)]/g, '$').replace(/\\[\[\]]/g, '$$');
        result = result.replace(/<img\s+src="([^"]+)"(?:\s*\?[^>]*)?(?:\s*\/>|>)/g, '![img]($1)');
        final_result += `\n---\nFile:${file_name}\n<Content>\n${result}\n</Content>\n`;
        required_flag = false;
        break;
      } else {
        fail_reason += `\n---\nFile:${file_name}\n<Content>\nFailed to get result (uid: ${uid}): ${result_data.data.status}\n</Content>\n`;
        flag = true;
        required_flag = false;
        break;
      }
    }

    if (required_flag) {
      fail_reason += `\n---\nFile:${file_name}\n<Content>\nTimeout for uid ${uid}\n</Content>\n`;
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
