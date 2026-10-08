import { describe, expect, it, beforeEach } from 'vitest';
import {
  getDomainConfig,
  updateDomainConfig,
  getSystemInstanceConfigSnapshot
} from '../../../../common/system/systemInstanceConfig/controller';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { getDomainDefaultConfig, SECRET_MASK } from '@fastgpt/global/common/system/config';

describe('systemInstanceConfig controller', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  describe('getDomainConfig', () => {
    it('returns default config and revision 0 when no record in DB', async () => {
      const res = await getDomainConfig('site');

      expect(res.domain).toBe('site');
      expect(res.revision).toBe(0);
      expect(res.overrides).toEqual({});
      expect(res.effectiveConfig).toEqual(getDomainDefaultConfig('site'));
    });

    it('returns masked secrets when maskSecrets option is true', async () => {
      // 先写入一个带 Key 的提供商配置
      await MongoSystemInstanceConfig.create({
        _id: 'providers',
        revision: 1,
        overrides: {
          documentParse: {
            customPdf: {
              url: 'https://pdf.example.com',
              key: 'real-pdf-api-key-12345'
            }
          }
        },
        updatedBy: { actor: 'admin' }
      });

      const maskedRes = await getDomainConfig('providers', { maskSecrets: true });
      expect(maskedRes.effectiveConfig.documentParse.customPdf.key).toBe(SECRET_MASK);
      expect(maskedRes.overrides.documentParse?.customPdf?.key).toBe(SECRET_MASK);

      const unmaskedRes = await getDomainConfig('providers');
      expect(unmaskedRes.effectiveConfig.documentParse.customPdf.key).toBe(
        'real-pdf-api-key-12345'
      );
      expect(unmaskedRes.overrides.documentParse?.customPdf?.key).toBe('real-pdf-api-key-12345');
    });
  });

  describe('updateDomainConfig', () => {
    it('creates first document with revision 1 when expectedRevision is 0', async () => {
      const updated = await updateDomainConfig({
        domain: 'site',
        expectedRevision: 0,
        submittedOverrides: {
          name: 'FastGPT Enterprise'
        },
        actor: {
          actor: 'admin',
          username: 'root'
        }
      });

      expect(updated.domain).toBe('site');
      expect(updated.revision).toBe(1);
      expect(updated.overrides.name).toBe('FastGPT Enterprise');
      expect(updated.effectiveConfig.name).toBe('FastGPT Enterprise');
      expect(updated.effectiveConfig.docUrl).toBe('https://doc.fastgpt.io'); // defaults preserved
    });

    it('increments revision on consecutive updates', async () => {
      await updateDomainConfig({
        domain: 'site',
        expectedRevision: 0,
        submittedOverrides: { name: 'V1' },
        actor: { actor: 'admin' }
      });

      const updatedV2 = await updateDomainConfig({
        domain: 'site',
        expectedRevision: 1,
        submittedOverrides: { name: 'V2' },
        actor: { actor: 'admin' }
      });

      expect(updatedV2.revision).toBe(2);
      expect(updatedV2.effectiveConfig.name).toBe('V2');
    });

    it('throws 409 conflict when expectedRevision does not match', async () => {
      await updateDomainConfig({
        domain: 'site',
        expectedRevision: 0,
        submittedOverrides: { name: 'V1' },
        actor: { actor: 'admin' }
      });

      // Try updating with stale expectedRevision 0
      await expect(
        updateDomainConfig({
          domain: 'site',
          expectedRevision: 0,
          submittedOverrides: { name: 'Stale' },
          actor: { actor: 'admin' }
        })
      ).rejects.toThrowError(/Revision conflict/);
    });

    it('preserves existing secret when client submits mask string', async () => {
      // 1. 首次保存 secret
      await updateDomainConfig({
        domain: 'providers',
        expectedRevision: 0,
        submittedOverrides: {
          documentParse: {
            customPdf: {
              url: 'https://pdf.example.com',
              key: 'original-secret-key'
            }
          }
        },
        actor: { actor: 'admin' }
      });

      // 2. 再次更新时，前端传回掩码 '******'
      const updated = await updateDomainConfig({
        domain: 'providers',
        expectedRevision: 1,
        submittedOverrides: {
          documentParse: {
            customPdf: {
              url: 'https://pdf.new-domain.com',
              key: SECRET_MASK
            }
          }
        },
        actor: { actor: 'admin' }
      });

      expect(updated.effectiveConfig.documentParse.customPdf.url).toBe(
        'https://pdf.new-domain.com'
      );
      expect(updated.effectiveConfig.documentParse.customPdf.key).toBe('original-secret-key'); // 保留原有密钥！
    });
  });

  describe('getSystemInstanceConfigSnapshot', () => {
    it('aggregates overrides across domains into a complete snapshot', async () => {
      await updateDomainConfig({
        domain: 'site',
        expectedRevision: 0,
        submittedOverrides: { name: 'Snapshot Site' },
        actor: { actor: 'system' }
      });

      await updateDomainConfig({
        domain: 'performance',
        expectedRevision: 0,
        submittedOverrides: { workflow: { maxRunTimes: 999 } },
        actor: { actor: 'system' }
      });

      const snapshot = await getSystemInstanceConfigSnapshot();
      expect(snapshot.site.name).toBe('Snapshot Site');
      expect(snapshot.performance.workflow.maxRunTimes).toBe(999);
      expect(snapshot.security.csrfEnabled).toBe(true); // default
      expect(snapshot.subservice.agentSandbox.provider).toBe('none'); // default
    });
  });
});
