import { addLog } from '../../common/system/log';
import { matchMdImg } from '@fastgpt/global/common/string/markdown';
import axios from 'axios';
import { getErrText } from '@fastgpt/global/common/error/utils';

export const useTextinServer = ({ appId, secretCode }: { appId: string; secretCode: string }) => {
  // Init request
  const instance = axios.create({
    baseURL: 'https://api.textin.com/ai/service/v1',
    timeout: 300000,
    headers: {
      'x-ti-app-id': appId,
      'x-ti-secret-code': secretCode
    }
  });

  // Response error handler
  const responseError = (err: any) => {
    if (!err) {
      return Promise.reject({ message: '[Textin] Unknown error' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: `[Textin] ${err}` });
    }
    if (err?.response?.data) {
      return Promise.reject({
        message: `[Textin] ${getErrText(err?.response?.data)}`
      });
    }
    if (typeof err.message === 'string') {
      return Promise.reject({ message: `[Textin] ${err.message}` });
    }

    addLog.error('[Textin] Unknown error', err);
    return Promise.reject({ message: `[Textin] ${getErrText(err)}` });
  };

  const parsePDF = async (fileBuffer: Buffer) => {
    addLog.debug('[Textin] PDF parse start');
    const startTime = Date.now();

    try {
      // Build request parameters (https://docs.textin.com/xparse/parse-quickstart#url%E5%8F%82%E6%95%B0%E8%AF%B4%E6%98%8E)
      const params = {
        get_image: 'objects', // 返回页面内的子图像
        image_output_type: 'base64str', // 图片对象以base64字符串返回
        parse_mode: 'auto', // 自动模式：直接提取pdf中的文字
        dpi: 144, // 坐标基准144 dpi
        markdown_details: 1, // 返回detail字段（markdown元素详细信息）
        table_flavor: 'md', // 表格按markdown语法输出
        paratext_mode: 'none', // 不展示非正文内容（页眉页脚等）
        page_details: 0, // 不返回pages字段
        remove_watermark: 1 // 去除水印
      };

      // Send request
      const { data } = await instance.post('/pdf_to_markdown', fileBuffer, {
        params,
        headers: { 'Content-Type': 'application/octet-stream' }
      });

      // Check response code
      if (data.code !== 200) {
        return Promise.reject(
          `[Textin] API error: ${data.message || data.code || 'Unknown error'}`
        );
      }

      // Get markdown content
      const rawMarkdown = data.result?.markdown;
      if (!rawMarkdown) {
        return Promise.reject('[Textin] No markdown content in response');
      }
      console.log('rawMarkdown', rawMarkdown);
      // Process tables and images (reuse existing utility functions)
      const { text, imageList } = matchMdImg(rawMarkdown);

      // Get page count
      const pages = data.result?.pages?.length || data.result?.total_page_number || 1;

      addLog.debug(`[Textin] PDF parse finished`, {
        time: `${Math.round((Date.now() - startTime) / 1000)}s`,
        pages
      });

      return {
        pages,
        text,
        imageList
      };
    } catch (error) {
      return responseError(error);
    }
  };

  return {
    parsePDF
  };
};
