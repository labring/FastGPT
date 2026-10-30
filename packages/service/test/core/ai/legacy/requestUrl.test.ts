import { describe, expect, it } from 'vitest';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  getLegacyModelEndpoint,
  hasLegacyRequestUrl,
  getLegacyOpenAIRequestOptions,
  getLegacyAxiosRequestConfig
} from '../../../../core/ai/legacy/requestUrl';

describe('Legacy requestUrl compatibility', () => {
  describe('getLegacyModelEndpoint and hasLegacyRequestUrl', () => {
    it('extracts endpoint and auth for system model with valid requestUrl', () => {
      const model = {
        scope: ModelScopeEnum.system,
        requestUrl: 'https://api.custom.com/v1',
        requestAuth: 'sk-secret-123'
      };

      expect(hasLegacyRequestUrl(model)).toBe(true);
      expect(getLegacyModelEndpoint(model)).toEqual({
        baseUrl: 'https://api.custom.com/v1',
        apiKey: 'sk-secret-123',
        authorization: 'Bearer sk-secret-123'
      });
    });

    it('handles requestUrl without requestAuth', () => {
      const model = {
        scope: ModelScopeEnum.system,
        requestUrl: 'http://localhost:8000/v1'
      };

      expect(getLegacyModelEndpoint(model)).toEqual({
        baseUrl: 'http://localhost:8000/v1',
        apiKey: undefined,
        authorization: undefined
      });
    });

    it('extracts endpoint and auth for team models (transitional capability)', () => {
      const model = {
        scope: ModelScopeEnum.team,
        tmbId: 'tmb-123',
        requestUrl: 'https://api.custom.com/v1',
        requestAuth: 'sk-team-123'
      };

      expect(hasLegacyRequestUrl(model)).toBe(true);
      expect(getLegacyModelEndpoint(model)).toEqual({
        baseUrl: 'https://api.custom.com/v1',
        apiKey: 'sk-team-123',
        authorization: 'Bearer sk-team-123'
      });
    });

    it('returns undefined when requestUrl is empty or whitespace', () => {
      expect(
        getLegacyModelEndpoint({
          scope: ModelScopeEnum.system,
          requestUrl: '   '
        })
      ).toBeUndefined();
    });
  });

  describe('getLegacyOpenAIRequestOptions', () => {
    it('generates path and auth for system model with requestUrl without scope headers', () => {
      const model = {
        scope: ModelScopeEnum.system,
        requestUrl: 'https://api.custom.com/v1',
        requestAuth: 'sk-custom'
      };

      const options = getLegacyOpenAIRequestOptions({
        model,
        usedUserOpenAIKey: false,
        headers: { 'X-Custom': 'val' },
        scopeHeaders: { 'X-Aiproxy-Group-Channel-Mode': 'global' }
      });

      expect(options).toEqual({
        path: 'https://api.custom.com/v1',
        headers: {
          'X-Custom': 'val',
          Authorization: 'Bearer sk-custom'
        }
      });
    });

    it('does not attach AI Proxy scope headers when a team model uses its own endpoint', () => {
      const options = getLegacyOpenAIRequestOptions({
        model: {
          scope: ModelScopeEnum.team,
          tmbId: 'tmb-123',
          requestUrl: 'https://api.custom.com/v1',
          requestAuth: 'sk-team'
        },
        usedUserOpenAIKey: false,
        headers: { 'X-Custom': 'val' },
        scopeHeaders: {
          'X-Aiproxy-Group': 'group-a',
          'X-Aiproxy-Group-Channel-Mode': 'own'
        }
      });

      expect(options).toEqual({
        path: 'https://api.custom.com/v1',
        headers: {
          'X-Custom': 'val',
          Authorization: 'Bearer sk-team'
        }
      });
    });

    it('strips the client default Authorization when the endpoint has no auth', () => {
      const options = getLegacyOpenAIRequestOptions({
        model: {
          scope: ModelScopeEnum.team,
          tmbId: 'tmb-123',
          requestUrl: 'https://api.custom.com/v1'
        },
        usedUserOpenAIKey: false,
        headers: { 'X-Custom': 'val' },
        scopeHeaders: { 'X-Aiproxy-Group': 'group-a' }
      });

      expect(options).toEqual({
        path: 'https://api.custom.com/v1',
        headers: {
          'X-Custom': 'val',
          Authorization: null
        }
      });
    });

    it('respects userKey over model requestUrl', () => {
      const model = {
        scope: ModelScopeEnum.system,
        requestUrl: 'https://api.custom.com/v1',
        requestAuth: 'sk-custom'
      };

      const options = getLegacyOpenAIRequestOptions({
        model,
        usedUserOpenAIKey: true,
        headers: { 'X-Custom': 'val' },
        scopeHeaders: { 'X-Aiproxy-Group-Channel-Mode': 'global' }
      });

      expect(options).toEqual({
        headers: {
          'X-Custom': 'val'
        }
      });
      expect(options.path).toBeUndefined();
    });

    it('retains scope headers when model has no requestUrl', () => {
      const model = {
        scope: ModelScopeEnum.system
      };

      const options = getLegacyOpenAIRequestOptions({
        model,
        usedUserOpenAIKey: false,
        headers: { 'X-Custom': 'val' },
        scopeHeaders: { 'X-Aiproxy-Group-Channel-Mode': 'global' }
      });

      expect(options).toEqual({
        headers: {
          'X-Custom': 'val',
          'X-Aiproxy-Group-Channel-Mode': 'global'
        }
      });
      expect(options.path).toBeUndefined();
    });
  });

  describe('getLegacyAxiosRequestConfig', () => {
    it('returns direct endpoint without scope headers for system model with requestUrl', () => {
      const model = {
        scope: ModelScopeEnum.system,
        requestUrl: 'https://internal-rerank.company.com/v1/rerank',
        requestAuth: 'key-123'
      };

      const config = getLegacyAxiosRequestConfig({
        model,
        defaultBaseUrl: 'https://aiproxy.fastgpt.in/v1',
        defaultPath: '/rerank',
        defaultAuthorization: 'Bearer aiproxy-token',
        scopeHeaders: { 'X-Aiproxy-Group-Channel-Mode': 'global' }
      });

      expect(config).toEqual({
        url: 'https://internal-rerank.company.com/v1/rerank',
        headers: {
          Authorization: 'Bearer key-123'
        }
      });
    });

    it('falls back to defaultBaseUrl and AI Proxy headers when no requestUrl', () => {
      const model = {
        scope: ModelScopeEnum.system
      };

      const config = getLegacyAxiosRequestConfig({
        model,
        defaultBaseUrl: 'https://aiproxy.fastgpt.in/v1',
        defaultPath: '/rerank',
        defaultAuthorization: 'Bearer aiproxy-token',
        scopeHeaders: { 'X-Aiproxy-Group-Channel-Mode': 'global' }
      });

      expect(config).toEqual({
        url: 'https://aiproxy.fastgpt.in/v1/rerank',
        headers: {
          Authorization: 'Bearer aiproxy-token',
          'X-Aiproxy-Group-Channel-Mode': 'global'
        }
      });
    });
  });
});
