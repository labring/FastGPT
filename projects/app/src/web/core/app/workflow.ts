import { getAppType } from '@fastgpt/global/core/app/utils';
import { postCreateApp } from './api';
import { appTypeMap } from '@/pageComponents/app/constants';
/**
 * 从URL获取工作流JSON数据
 */
export const fetchWorkflowFromUrl = async (url: string) => {
  // 自定义响应类型，用于手动处理剪贴板内容
  type CustomResponse = {
    text: () => Promise<string>;
    ok: boolean;
    status: number;
    headers: {
      get: (name: string) => string | null;
    };
  };

  try {
    if (!url || typeof url !== 'string') {
      throw new Error('WORKFLOW_IMPORT_ERROR: URL为空或格式错误');
    }

    // 清理URL
    let fetchUrl = url.trim();

    // 如果URL最后有斜杠，移除它
    if (fetchUrl.endsWith('/')) {
      fetchUrl = fetchUrl.slice(0, -1);
    }

    // 确保URL是绝对路径
    if (!fetchUrl.startsWith('http://') && !fetchUrl.startsWith('https://')) {
      fetchUrl = `https://${fetchUrl}`;
    }

    // 设置请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时

    try {
      // 首先检查这是否是本地请求（localhost或127.0.0.1）
      const isLocalRequest = fetchUrl.includes('localhost') || fetchUrl.includes('127.0.0.1');

      if (isLocalRequest) {
        try {
          // 尝试方法1: 使用相对路径（如果URL是指向同一个域的不同端口）
          const urlObj = new URL(fetchUrl);
          const path = urlObj.pathname + urlObj.search;
          console.log(`尝试使用相对路径请求: ${path}`);
          const relativeResponse = await fetch(path, {
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          }).catch((e) => {
            console.log(`相对路径请求失败: ${e.message}`);
            return null;
          });

          if (relativeResponse?.ok) {
            clearTimeout(timeoutId);
            const text = await relativeResponse.text();
            return JSON.parse(text);
          }
        } catch (err: any) {
          console.log(`相对路径方法失败: ${err.message}`);
        }

        // 尝试方法2: 如果是本地开发环境，建议用户手动复制JSON
        const userConfirmed = window.confirm(
          `由于CORS限制，无法直接从 ${fetchUrl} 获取工作流数据。\n\n` +
            '请手动打开该URL，复制JSON内容，然后点击"确定"来粘贴。\n\n' +
            '或者点击"取消"放弃导入。'
        );

        if (userConfirmed) {
          try {
            const clipboardText = await navigator.clipboard.readText().catch(() => '');
            if (clipboardText) {
              try {
                return JSON.parse(clipboardText);
              } catch (err) {
                throw new Error('剪贴板内容不是有效的JSON格式，请确保复制了完整的JSON数据');
              }
            } else {
              throw new Error('无法读取剪贴板内容，请确保已授予网站剪贴板权限');
            }
          } catch (err) {
            console.error('读取剪贴板失败:', err);

            // 如果剪贴板读取失败，提供手动输入选项
            const jsonInput = window.prompt('无法自动读取剪贴板。请手动粘贴工作流JSON数据:', '');

            if (jsonInput) {
              try {
                return JSON.parse(jsonInput);
              } catch (err) {
                throw new Error('输入的内容不是有效的JSON格式');
              }
            } else {
              throw new Error('未提供JSON数据，导入已取消');
            }
          }
        } else {
          throw new Error('用户取消了导入操作');
        }
      }

      // 如果不是本地请求，尝试正常请求
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        mode: 'cors' // 尝试CORS
      }).catch(async (err) => {
        console.log(`直接请求失败: ${err.message}，尝试替代方法`);

        // 如果是CORS错误，尝试使用no-cors模式（但这会导致不能读取响应内容）
        if (
          err.message &&
          (err.message.includes('CORS') ||
            err.message.includes('网络') ||
            err.message.includes('network'))
        ) {
          console.log('检测到CORS错误，提示用户手动获取JSON数据');

          const userConfirmed = window.confirm(
            `由于CORS限制，无法直接从 ${fetchUrl} 获取工作流数据。\n\n` +
              '请手动打开该URL，复制JSON内容，然后点击"确定"来粘贴。\n\n' +
              '或者点击"取消"放弃导入。'
          );

          if (userConfirmed) {
            try {
              const clipboardText = await navigator.clipboard.readText().catch(() => '');
              if (clipboardText) {
                try {
                  const customResponse: CustomResponse = {
                    text: () => Promise.resolve(clipboardText),
                    ok: true,
                    status: 200,
                    headers: {
                      get: (name: string) => (name === 'content-type' ? 'application/json' : null)
                    }
                  };
                  return customResponse;
                } catch (err) {
                  throw new Error('剪贴板内容不是有效的JSON格式，请确保复制了完整的JSON数据');
                }
              } else {
                throw new Error('无法读取剪贴板内容，请确保已授予网站剪贴板权限');
              }
            } catch (err) {
              console.error('读取剪贴板失败:', err);

              // 如果剪贴板读取失败，提供手动输入选项
              const jsonInput = window.prompt('无法自动读取剪贴板。请手动粘贴工作流JSON数据:', '');

              if (jsonInput) {
                const customResponse: CustomResponse = {
                  text: () => Promise.resolve(jsonInput),
                  ok: true,
                  status: 200,
                  headers: {
                    get: (name: string) => (name === 'content-type' ? 'application/json' : null)
                  }
                };
                return customResponse;
              } else {
                throw new Error('未提供JSON数据，导入已取消');
              }
            }
          } else {
            throw new Error('用户取消了导入操作');
          }
        }

        throw err;
      });

      clearTimeout(timeoutId);

      console.log(`获取状态码: ${response.status}`);

      if (!response.ok) {
        throw new Error(`获取工作流失败，HTTP错误状态: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      console.log(`响应内容类型: ${contentType}`);

      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`警告：响应内容类型不是JSON (${contentType})`);
      }

      const text = await response.text();
      console.log(`获取到响应内容长度: ${text.length}`);

      if (!text || text.trim() === '') {
        throw new Error('获取的响应内容为空');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonError) {
        console.error('JSON解析失败:', jsonError);
        throw new Error('无法解析响应内容为JSON，请确保URL返回有效的JSON数据');
      }

      console.log('工作流数据获取成功', data ? '数据有效' : '数据为空');

      if (!data) {
        throw new Error('获取的工作流数据为空');
      }

      return data;
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') {
        throw new Error('获取工作流超时，请检查URL是否正确或稍后重试');
      } else if (fetchError.message && fetchError.message.includes('CORS')) {
        throw new Error('CORS错误：无法访问该URL，请确保URL允许跨域请求或使用支持CORS的端点');
      }
      throw fetchError;
    }
  } catch (error) {
    console.error('获取工作流数据失败:', error);
    throw new Error(`获取工作流失败: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * 从URL获取工作流JSON数据并创建应用
 */
export const importWorkflowFromUrl = async ({
  url,
  name,
  parentId
}: {
  url: string;
  name?: string;
  parentId?: string;
}) => {
  try {
    console.log(`开始从URL导入工作流: ${url}`);

    // 获取工作流数据
    const data = await fetchWorkflowFromUrl(url);

    if (!data || !data.nodes || !data.edges) {
      throw new Error('工作流数据格式不正确，缺少nodes或edges');
    }

    // 获取应用类型
    const appType = getAppType(data);
    if (!appType) {
      throw new Error('无法识别应用类型，请确保导入的是有效的工作流JSON');
    }

    console.log(`识别到工作流类型: ${appType}`);

    // 创建应用
    const appId = await postCreateApp({
      parentId,
      avatar: appTypeMap[appType].avatar,
      name: name || `未命名 ${new Date().toLocaleString()}`,
      type: appType,
      modules: data.nodes || [],
      edges: data.edges || [],
      chatConfig: data.chatConfig || {}
    });

    console.log(`工作流导入成功，创建的应用ID: ${appId}`);
    return appId;
  } catch (error) {
    console.error('导入工作流失败:', error);
    throw error;
  }
};
