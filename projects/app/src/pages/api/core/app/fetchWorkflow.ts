import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import axios from 'axios';

export type FetchWorkflowQuery = {
  url: string;
};

export type FetchWorkflowResponseType = ApiResponseType<{
  data: JSON;
}>;

async function handler(
  req: ApiRequestProps<{}, FetchWorkflowQuery>,
  res: FetchWorkflowResponseType
) {
  const { url } = req.query;

  if (!url) {
    console.error('[后端代理] URL参数为空');
    return Promise.reject('URL参数不能为空');
  }

  let targetUrl = url;
  try {
    if (/%[0-9A-Fa-f]{2}/.test(url)) {
      targetUrl = decodeURIComponent(url);
    }
  } catch (err) {
    console.warn('[后端代理] URL解码失败，使用原始URL');
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FastGPT/1.0)'
      },
      timeout: 30000,
      validateStatus: (status) => status < 500 //
    });

    if (response.status !== 200) {
      console.error(`[后端代理] 请求返回非200状态码: ${response.status}`);
      return Promise.reject(`请求返回非200状态码: ${response.status}`);
    }

    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
      console.warn(`[后端代理] 响应内容类型不是JSON: ${contentType}`);
      try {
        JSON.parse(JSON.stringify(response.data));
      } catch (error) {
        return Promise.reject(`响应内容不是有效的JSON格式: ${contentType}`);
      }
    }

    return response.data;
  } catch (error: any) {
    console.error(`[后端代理] 获取工作流数据失败:`, error.message);

    let errorMessage = '请求失败';

    if (error.code === 'ECONNABORTED') {
      errorMessage = '请求超时，请检查URL是否正确或稍后重试';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '无法解析域名，请检查URL是否正确';
    } else if (error.response) {
      errorMessage = `请求失败，状态码: ${error.response.status}, 信息: ${error.message}`;
    } else {
      errorMessage = `请求失败: ${error.message}`;
    }

    return Promise.reject(errorMessage);
  }
}

export default NextAPI(handler);
