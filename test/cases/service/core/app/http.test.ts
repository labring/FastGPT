import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runHTTPTool } from '@fastgpt/service/core/app/http';

describe('SSRF Vulnerability Fix Tests', () => {
  const originalEnv = process.env.CHECK_INTERNAL_IP;

  beforeEach(() => {
    // 确保测试环境启用内部 IP 检查
    delete process.env.CHECK_INTERNAL_IP;
  });

  afterEach(() => {
    // 恢复原始环境变量
    if (originalEnv !== undefined) {
      process.env.CHECK_INTERNAL_IP = originalEnv;
    } else {
      delete process.env.CHECK_INTERNAL_IP;
    }
  });

  describe('AWS Metadata Endpoint Protection', () => {
    it('should block AWS metadata endpoint (169.254.169.254)', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://169.254.169.254',
        toolPath: '/latest/meta-data/iam/security-credentials/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block AWS metadata endpoint with IPv6', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://[fd00:ec2::254]',
        toolPath: '/latest/meta-data/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Kubernetes Service Protection', () => {
    it('should block Kubernetes default service', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://kubernetes.default.svc',
        toolPath: '/api/v1/namespaces/default/secrets/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block Kubernetes HTTPS endpoint', async () => {
      const result = await runHTTPTool({
        baseUrl: 'https://kubernetes.default.svc',
        toolPath: '/api/v1/pods',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Private IP Range Protection', () => {
    it('should block 10.0.0.0/8 private network', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://10.0.0.1',
        toolPath: '/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block 172.16.0.0/12 private network', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://172.16.0.1',
        toolPath: '/internal',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block 192.168.0.0/16 private network', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://192.168.1.1',
        toolPath: '/router',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Localhost Protection', () => {
    it('should block localhost', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://localhost',
        toolPath: '/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block 127.0.0.1', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://127.0.0.1',
        toolPath: '/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block IPv6 localhost (::1)', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://[::1]',
        toolPath: '/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Cloud Provider Metadata Endpoints', () => {
    it('should block GCP metadata endpoint', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://metadata.google.internal',
        toolPath: '/computeMetadata/v1/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block Alibaba Cloud metadata endpoint', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://100.100.100.200',
        toolPath: '/latest/meta-data/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block Tencent Cloud metadata endpoint', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://metadata.tencentyun.com',
        toolPath: '/latest/meta-data/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Link-Local Address Protection', () => {
    it('should block 169.254.0.0/16 link-local addresses', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://169.254.1.1',
        toolPath: '/metadata',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should block IPv6 link-local addresses (fe80::)', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://[fe80::1]',
        toolPath: '/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('URL Construction Edge Cases', () => {
    it('should handle baseUrl without protocol', async () => {
      const result = await runHTTPTool({
        baseUrl: '169.254.169.254',
        toolPath: '/latest/meta-data/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should handle relative toolPath', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://localhost:8080',
        toolPath: 'api/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });

    it('should handle absolute toolPath', async () => {
      const result = await runHTTPTool({
        baseUrl: 'http://localhost',
        toolPath: '/api/admin',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
      expect(result.data).toBeUndefined();
    });
  });

  describe('Environment Variable Control', () => {
    it('should always block cloud metadata endpoints even when CHECK_INTERNAL_IP=false', async () => {
      process.env.CHECK_INTERNAL_IP = 'false';

      // 云服务商元数据端点应该始终被阻止，这是安全的关键
      const result = await runHTTPTool({
        baseUrl: 'http://169.254.169.254',
        toolPath: '/latest/meta-data/',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
    });

    it('should always block localhost even when CHECK_INTERNAL_IP=false', async () => {
      process.env.CHECK_INTERNAL_IP = 'false';

      // localhost 应该始终被阻止
      const result = await runHTTPTool({
        baseUrl: 'http://localhost',
        toolPath: '/test',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
    });

    it('should block internal addresses by default (no env var)', async () => {
      delete process.env.CHECK_INTERNAL_IP;

      const result = await runHTTPTool({
        baseUrl: 'http://localhost',
        toolPath: '/test',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
    });

    it('should block internal addresses when CHECK_INTERNAL_IP=true', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';

      const result = await runHTTPTool({
        baseUrl: 'http://localhost',
        toolPath: '/test',
        method: 'GET',
        params: {}
      });

      expect(result.errorMsg).toBe('Access to internal addresses is not allowed');
    });
  });

  describe('Legitimate External URLs', () => {
    // 注意：这些测试会实际发起网络请求，可能需要 mock
    it('should allow legitimate external URLs (example.com)', async () => {
      // 这个测试需要 mock axios 或者跳过
      // 因为我们不想在测试中实际发起外部请求
    });
  });
});
