import { getAppType } from '@fastgpt/global/core/app/utils';
import { postCreateApp } from './api';
import { appTypeMap } from '@/pageComponents/app/constants';
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

/**
 * 从URL获取工作流JSON数据并创建应用
 */
export const importWorkflowFromUrl = async ({
  url,
  name,
  parentId,
  data
}: {
  url: string;
  name?: string;
  parentId?: string;
  data?: any; // 可选参数，允许直接传入已获取的工作流数据
}) => {
  try {
    const workflowData = data || (await fetchWorkflowFromUrl(url));

    if (!workflowData || !workflowData.nodes || !workflowData.edges) {
      return Promise.reject(new Error('工作流数据格式不正确，缺少nodes或edges'));
    }

    const appType = getAppType(workflowData);
    if (!appType) {
      return Promise.reject(new Error('无法识别应用类型，请确保导入的是有效的工作流JSON'));
    }

    const appId = await postCreateApp({
      parentId,
      avatar: appTypeMap[appType].avatar,
      name: name || `未命名 ${new Date().toLocaleString()}`,
      type: appType,
      modules: workflowData.nodes || [],
      edges: workflowData.edges || [],
      chatConfig: workflowData.chatConfig || {}
    });

    return appId;
  } catch (error) {
    console.error('导入工作流失败:', error);
    return Promise.reject(error);
  }
};
