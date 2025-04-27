import { postFetchWorkflow } from './api/app';

export const fetchWorkflowFromUrl = async (url: string) => {
  try {
    if (!url || typeof url !== 'string') {
      return Promise.reject(new Error('WORKFLOW_IMPORT_ERROR: URL为空或格式错误'));
    }

    let fetchUrl = url.trim();

    if (fetchUrl.endsWith('/')) {
      fetchUrl = fetchUrl.slice(0, -1);
    }

    if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
      fetchUrl = `https://${fetchUrl}`;
    }

    try {
      const encodedUrl = encodeURIComponent(fetchUrl);

      const proxyResponse = await postFetchWorkflow({
        url: encodedUrl
      }).catch((e) => {
        console.error(`获取失败: ${e.message || 'UNKNOWN_ERROR'}`);
        return null;
      });

      if (proxyResponse) {
        console.log('工作流数据获取成功');
        return proxyResponse;
      } else {
        return Promise.reject(new Error('后端代理请求返回空数据'));
      }
    } catch (err: any) {
      console.error(`获取失败: ${err.message || 'UNKNOWN_ERROR'}`);
      return Promise.reject(new Error('无法获取工作流数据'));
    }
  } catch (error) {
    console.error('获取工作流数据失败:', error);
    return Promise.reject(
      new Error(`获取工作流失败: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
};
