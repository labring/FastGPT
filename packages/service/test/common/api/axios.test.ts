import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';

type AxiosRequestConfig = {
  timeout?: number;
  headers?: Record<string, string>;
  proxy?: false | { host: string; port: number };
  baseURL?: string;
  httpAgent?: any;
  httpsAgent?: any;
};

describe('axios.ts', () => {
  describe('createProxyAxios', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('应该创建一个带有 ProxyAgent 的 axios 实例', () => {
      const instance = createProxyAxios();

      expect(instance).toBeDefined();
      expect(instance.defaults).toBeDefined();
      expect(instance.defaults.proxy).toBe(false);
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该使用相同的 agent 作为 httpAgent 和 httpsAgent', () => {
      const instance = createProxyAxios();

      expect(instance.defaults.httpAgent).toBe(instance.defaults.httpsAgent);
    });

    it('应该接受自定义配置并合并到默认配置中', () => {
      const customConfig: AxiosRequestConfig = {
        timeout: 5000,
        headers: {
          'Custom-Header': 'test-value'
        }
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.timeout).toBe(5000);
      expect(instance.defaults.headers?.['Custom-Header']).toBe('test-value');
      expect(instance.defaults.proxy).toBe(false);
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该允许自定义配置覆盖默认的 proxy 设置', () => {
      const customConfig: AxiosRequestConfig = {
        proxy: {
          host: 'localhost',
          port: 8080
        }
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.proxy).toEqual({
        host: 'localhost',
        port: 8080
      });
    });

    it('应该保留 ProxyAgent 即使提供了自定义配置', () => {
      const customConfig: AxiosRequestConfig = {
        baseURL: 'https://api.example.com'
      };

      const instance = createProxyAxios(customConfig);

      expect(instance.defaults.baseURL).toBe('https://api.example.com');
      expect(instance.defaults.httpAgent).toBeDefined();
      expect(instance.defaults.httpsAgent).toBeDefined();
    });

    it('应该创建可以发起请求的 axios 实例', () => {
      const instance = createProxyAxios();

      expect(typeof instance.get).toBe('function');
      expect(typeof instance.post).toBe('function');
      expect(typeof instance.put).toBe('function');
      expect(typeof instance.delete).toBe('function');
      expect(typeof instance.request).toBe('function');
    });
  });

  describe('axios 导出实例', () => {
    it('应该导出一个默认的 axios 实例', async () => {
      const { axios } = await import('@fastgpt/service/common/api/axios');

      expect(axios).toBeDefined();
      expect(axios.defaults).toBeDefined();
      expect(axios.defaults.proxy).toBe(false);
      expect(axios.defaults.httpAgent).toBeDefined();
      expect(axios.defaults.httpsAgent).toBeDefined();
    });
  });
});
