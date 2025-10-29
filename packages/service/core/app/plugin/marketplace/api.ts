import axios, { type Method } from 'axios';
import type { ToolListItem, ToolDetailResponse } from '@fastgpt/global/core/app/plugin/type';
import { addLog } from '../../../../common/system/log';
import type { PaginationResponse } from '../../../../../web/common/fetch/type';

type ResponseDataType = {
  success: boolean;
  message: string;
  data: any;
};

const marketplaceBaseUrl = process.env.MARKETPLACE_URL || '';

export const useMarketplaceRequest = () => {
  if (!marketplaceBaseUrl) {
    throw new Error('MARKETPLACE_URL is not configured');
  }

  const instance = axios.create({
    baseURL: marketplaceBaseUrl,
    timeout: 60000, // 超时时间 60s
    headers: {
      'Content-Type': 'application/json'
    }
  });

  /**
   * 响应数据检查
   */
  const checkRes = (data: ResponseDataType) => {
    if (data === undefined) {
      addLog.info('marketplace data is empty');
      return Promise.reject('服务器异常');
    }

    // 检查响应格式
    if (!data.success && data.message) {
      return Promise.reject(data.message);
    }

    return data.data;
  };

  /**
   * 响应错误处理
   */
  const responseError = (err: any) => {
    console.log('marketplace request error->', err);

    if (!err) {
      return Promise.reject({ message: '未知错误' });
    }
    if (typeof err === 'string') {
      return Promise.reject({ message: err });
    }
    if (typeof err.message === 'string') {
      return Promise.reject({ message: err.message });
    }
    if (typeof err.data === 'string') {
      return Promise.reject({ message: err.data });
    }
    if (err?.response?.data) {
      const errorData = err.response.data;
      return Promise.reject({
        message: errorData.message || `Marketplace API error: ${err.response.status}`,
        statusCode: err.response.status
      });
    }
    return Promise.reject(err);
  };

  /**
   * 通用请求方法
   */
  const request = <T>(url: string, data: any, method: Method): Promise<T> => {
    /* 去空值 */
    for (const key in data) {
      if (data[key] === undefined || data[key] === null) {
        delete data[key];
      }
    }

    return instance
      .request({
        url,
        method,
        data: ['POST', 'PUT'].includes(method) ? data : undefined,
        params: !['POST', 'PUT'].includes(method) ? data : undefined
      })
      .then((res) => checkRes(res.data))
      .catch((err) => responseError(err));
  };

  /**
   * 获取工具列表
   */
  const getToolList = async (params: {
    pageNum: number;
    pageSize: number;
    searchKey?: string;
    tags?: string[];
  }): Promise<PaginationResponse<ToolListItem>> => {
    return request<PaginationResponse<ToolListItem>>('/api/tool/list', params, 'POST');
  };

  /**
   * 获取工具详情
   */
  const getToolDetail = async (params: { toolId: string }): Promise<ToolDetailResponse> => {
    if (!params.toolId) {
      return Promise.reject({ message: 'Tool ID is required' });
    }

    return request<ToolDetailResponse>('/api/tool/detail', { toolId: params.toolId }, 'GET');
  };

  return {
    getToolList,
    getToolDetail
  };
};
