import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  getDomainConfig,
  updateDomainConfig,
  batchUpdateDomainConfigs,
  getSystemInstanceConfigSnapshot,
  reloadSystemInstanceConfig
} from '../../../../common/system/systemInstanceConfig/controller';
import { getSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/runtime';
import { connectionMongo } from '../../../../common/mongo';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
import { getDomainDefaultConfig } from '@fastgpt/global/common/system/config/schema';
import { encryptSecret } from '@fastgpt/service/common/secret/aes256gcm';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

describe('systemInstanceConfig controller', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it('accepts an unset runtime URL but rejects empty and malformed administrative URL updates', async () => {
    expect((await getDomainConfig('site')).effectiveConfig.publicUrl).toBe('');
    for (const publicUrl of [
      '',
      '   ',
      'invalid',
      'https://u:p@site.test',
      'https://site.test?key=value'
    ]) {
      await expect(
        updateDomainConfig({
          domain: 'site',
          expectedRevision: 0,
          submittedOverrides: { publicUrl },
          actor: { actor: 'admin' }
        })
      ).rejects.toBeInstanceOf(ApiRequestInputParseError);
    }
    expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' })).toBeNull();
    const result = await updateDomainConfig({
      domain: 'site',
      expectedRevision: 0,
      submittedOverrides: { publicUrl: ' https://main.test/ ' },
      actor: { actor: 'admin' }
    });
    expect(result.effectiveConfig.publicUrl).toBe('https://main.test');
  });

  it.each(['missing', 'empty'])(
    'rejects new external provider variables for a %s configuration before writing any scopes',
    async (state) => {
      if (state === 'empty') {
        await MongoSystemInstanceConfig.create({
          domain: 'providers',
          revision: 1,
          overrides: { externalProviderWorkflowVariables: [] }
        });
      }
      await expect(
        batchUpdateDomainConfigs({
          items: [
            { domain: 'site', expectedRevision: 0, overrides: { name: 'Must not be saved' } },
            {
              domain: 'providers',
              expectedRevision: state === 'empty' ? 1 : 0,
              overrides: {
                externalProviderWorkflowVariables: [{ name: 'New', key: 'System_new' }]
              }
            }
          ],
          actor: { actor: 'admin' }
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toBeNull();
      expect(
        (await getDomainConfig('providers')).effectiveConfig.externalProviderWorkflowVariables
      ).toEqual([]);
    }
  );

  it('preserves and edits existing external variables but prevents reactivation after clearing', async () => {
    const entries = [{ name: 'Legacy', key: 'System_legacy', intro: '', isOpen: true, url: '' }];
    await MongoSystemInstanceConfig.create({
      domain: 'providers',
      revision: 1,
      overrides: { externalProviderWorkflowVariables: entries }
    });
    const unrelated = await updateDomainConfig({
      domain: 'providers',
      expectedRevision: 1,
      submittedOverrides: { documentParse: { customPdf: { price: 2.5 } } },
      actor: { actor: 'admin' }
    });
    expect(unrelated.effectiveConfig.externalProviderWorkflowVariables).toEqual(entries);

    const edited = await updateDomainConfig({
      domain: 'providers',
      expectedRevision: unrelated.revision,
      submittedOverrides: {
        externalProviderWorkflowVariables: [{ ...entries[0], name: 'Edited' }]
      },
      actor: { actor: 'admin' }
    });
    expect(edited.effectiveConfig.externalProviderWorkflowVariables[0].name).toBe('Edited');

    const cleared = await updateDomainConfig({
      domain: 'providers',
      expectedRevision: edited.revision,
      submittedOverrides: { externalProviderWorkflowVariables: [] },
      actor: { actor: 'admin' }
    });
    expect(cleared.effectiveConfig.externalProviderWorkflowVariables).toEqual([]);
    expect(cleared.effectiveConfig.documentParse.customPdf.price).toBe(2.5);
    await expect(
      updateDomainConfig({
        domain: 'providers',
        expectedRevision: cleared.revision,
        submittedOverrides: { externalProviderWorkflowVariables: entries },
        actor: { actor: 'admin' }
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(
      (await getDomainConfig('providers')).effectiveConfig.externalProviderWorkflowVariables
    ).toEqual([]);
  });

  it('stores the origins switch independently while retaining the legacy allowlist', async () => {
    const origins = ['https://legacy.example.com'];
    await MongoSystemInstanceConfig.create({
      domain: 'security',
      revision: 1,
      overrides: { allowedOrigins: origins }
    });
    const disabled = await updateDomainConfig({
      domain: 'security',
      expectedRevision: 1,
      submittedOverrides: { allowedOriginsEnabled: false },
      actor: { actor: 'admin' }
    });
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'security' }).lean();
    expect(stored?.overrides).toMatchObject({
      allowedOriginsEnabled: false,
      allowedOrigins: origins
    });
    expect((await getSystemInstanceConfigSnapshot()).snapshot.security).toMatchObject({
      allowedOriginsEnabled: false,
      allowedOrigins: origins
    });
    const enabled = await updateDomainConfig({
      domain: 'security',
      expectedRevision: disabled.revision,
      submittedOverrides: { allowedOriginsEnabled: true },
      actor: { actor: 'admin' }
    });
    expect(enabled.effectiveConfig).toMatchObject({
      allowedOriginsEnabled: true,
      allowedOrigins: origins
    });
  });

  it.each([false, true])(
    'prevents creating deprecated fast-login entries with an existing empty scope: %s',
    async (existing) => {
      if (existing) {
        await MongoSystemInstanceConfig.create({
          domain: 'auth',
          revision: 1,
          overrides: { fastLogin: [] }
        });
      }
      await expect(
        updateDomainConfig({
          domain: 'auth',
          expectedRevision: existing ? 1 : 0,
          submittedOverrides: { fastLogin: [{ key: 'new', authUrl: 'https://login.test' }] },
          actor: { actor: 'admin' }
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect((await getDomainConfig('auth')).effectiveConfig.fastLogin).toEqual([]);
    }
  );

  it('keeps legacy fast login editable and preserves its clear intent without allowing reactivation', async () => {
    const legacy = [{ key: 'legacy', authUrl: 'https://legacy-login.test' }];
    await MongoSystemInstanceConfig.create({
      domain: 'auth',
      revision: 1,
      overrides: { fastLogin: legacy }
    });
    const edited = await updateDomainConfig({
      domain: 'auth',
      expectedRevision: 1,
      submittedOverrides: { fastLogin: [{ key: 'legacy', authUrl: 'https://updated-login.test' }] },
      actor: { actor: 'admin' }
    });
    expect(edited.effectiveConfig.fastLogin[0].authUrl).toBe('https://updated-login.test');
    const cleared = await updateDomainConfig({
      domain: 'auth',
      expectedRevision: edited.revision,
      submittedOverrides: { fastLogin: [] },
      actor: { actor: 'admin' }
    });
    expect(cleared.effectiveConfig.fastLogin).toEqual([]);
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean();
    expect(stored?.explicitDefaultPaths).toContain('fastLogin');
    await expect(
      updateDomainConfig({
        domain: 'auth',
        expectedRevision: cleared.revision,
        submittedOverrides: { fastLogin: legacy },
        actor: { actor: 'admin' }
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    const unrelated = await updateDomainConfig({
      domain: 'auth',
      expectedRevision: cleared.revision,
      submittedOverrides: { openApiKeyMaxCount: 42 },
      actor: { actor: 'admin' }
    });
    expect(unrelated.effectiveConfig.fastLogin).toEqual([]);
  });

  it.each([undefined, false])(
    'prevents enabling deprecated OpenAI accounts from %s',
    async (value) => {
      if (value === false) {
        await MongoSystemInstanceConfig.create({
          domain: 'feature',
          revision: 1,
          overrides: { showOpenaiAccount: false }
        });
      }
      await expect(
        batchUpdateDomainConfigs({
          items: [
            { domain: 'site', expectedRevision: 0, overrides: { name: 'Should not be saved' } },
            {
              domain: 'feature',
              expectedRevision: value === false ? 1 : 0,
              overrides: { showOpenaiAccount: true }
            }
          ],
          actor: { actor: 'admin' }
        })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toBeNull();
      expect((await getDomainConfig('feature')).effectiveConfig.showOpenaiAccount).toBe(false);
    }
  );

  it('preserves an enabled legacy OpenAI account switch but never re-enables it after saving false', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'feature',
      revision: 1,
      overrides: { showOpenaiAccount: true }
    });
    const kept = await updateDomainConfig({
      domain: 'feature',
      expectedRevision: 1,
      submittedOverrides: { showOpenaiAccount: true, enableTeamModel: true },
      actor: { actor: 'admin' }
    });
    expect(kept.effectiveConfig.showOpenaiAccount).toBe(true);
    const closed = await updateDomainConfig({
      domain: 'feature',
      expectedRevision: kept.revision,
      submittedOverrides: { showOpenaiAccount: false },
      actor: { actor: 'admin' }
    });
    expect(closed.effectiveConfig.showOpenaiAccount).toBe(false);
    const stored = await MongoSystemInstanceConfig.findOne({ domain: 'feature' }).lean();
    expect(stored?.explicitDefaultPaths).toContain('showOpenaiAccount');
    await expect(
      updateDomainConfig({
        domain: 'feature',
        expectedRevision: closed.revision,
        submittedOverrides: { showOpenaiAccount: true },
        actor: { actor: 'admin' }
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    const unrelated = await updateDomainConfig({
      domain: 'feature',
      expectedRevision: closed.revision,
      submittedOverrides: { enableTeamModel: false },
      actor: { actor: 'admin' }
    });
    expect(unrelated.effectiveConfig.showOpenaiAccount).toBe(false);
  });

  it('changes the runtime version when a scope is recreated with the same revision', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { name: 'Before' }
    });
    const before = await getSystemInstanceConfigSnapshot();
    await MongoSystemInstanceConfig.deleteOne({ domain: 'site' });
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { name: 'After' }
    });
    const after = await getSystemInstanceConfigSnapshot();
    expect(after.snapshot.site.name).toBe('After');
    expect(after.versionTag).not.toBe(before.versionTag);
  });

  describe('getDomainConfig', () => {
    it('returns default config and revision 0 when no record in DB', async () => {
      const res = await getDomainConfig('site');

      expect(res.domain).toBe('site');
      expect(res.revision).toBe(0);
      expect(res.overrides).toEqual({});
      expect(res.effectiveConfig).toEqual(getDomainDefaultConfig('site'));
    });

    it('reads legacy plaintext and decrypts persisted ciphertext', async () => {
      await MongoSystemInstanceConfig.create({
        domain: 'providers',
        revision: 1,
        overrides: {
          documentParse: {
            customPdf: {
              url: 'https://pdf.example.com',
              key: 'legacy-plaintext',
              doc2xKey: { secret: encryptSecret('encrypted-key') }
            }
          }
        },
        updatedBy: { actor: 'admin' }
      });

      const result = await getDomainConfig('providers');
      expect(result.effectiveConfig.documentParse.customPdf).toMatchObject({
        key: 'legacy-plaintext',
        doc2xKey: 'encrypted-key'
      });
      expect(result.overrides.documentParse?.customPdf?.doc2xKey).toBe('encrypted-key');
    });
  });

  describe('updateDomainConfig', () => {
    it.each(['wsUrl', 'previewUrl', 'secret'] as const)(
      'rejects an enabled sandbox with missing %s before writing',
      async (missing) => {
        const proxy = {
          wsUrl: 'wss://proxy.test',
          previewUrl: 'https://proxy.test',
          secret: 'proxy_secret_32_characters_minimum',
          [missing]: ''
        };
        await expect(
          updateDomainConfig({
            domain: 'subservice',
            expectedRevision: 0,
            submittedOverrides: {
              agentSandbox: {
                provider: 'opensandbox',
                opensandbox: { baseUrl: 'https://sandbox.test' },
                proxy
              }
            },
            actor: { actor: 'admin' }
          })
        ).rejects.toBeInstanceOf(ApiRequestInputParseError);
        expect(await MongoSystemInstanceConfig.findOne({ domain: 'subservice' }).lean()).toBeNull();
      }
    );

    it('validates the decrypted proxy secret when a partial update omits it', async () => {
      const secret = 'proxy_secret_32_characters_minimum';
      await updateDomainConfig({
        domain: 'subservice',
        expectedRevision: 0,
        submittedOverrides: {
          agentSandbox: {
            provider: 'opensandbox',
            opensandbox: { baseUrl: 'https://sandbox.test' },
            proxy: { wsUrl: 'wss://proxy.test', previewUrl: 'https://proxy.test', secret }
          }
        },
        actor: { actor: 'admin' }
      });
      await updateDomainConfig({
        domain: 'subservice',
        expectedRevision: 1,
        submittedOverrides: {
          agentSandbox: { proxy: { wsUrl: 'wss://updated.test' } }
        },
        actor: { actor: 'admin' }
      });
      expect((await getDomainConfig('subservice')).effectiveConfig.agentSandbox.proxy).toEqual({
        wsUrl: 'wss://updated.test',
        previewUrl: 'https://proxy.test',
        secret
      });
      await expect(
        updateDomainConfig({
          domain: 'subservice',
          expectedRevision: 2,
          submittedOverrides: { agentSandbox: { proxy: { secret: 'short' } } },
          actor: { actor: 'admin' }
        })
      ).rejects.toBeInstanceOf(ApiRequestInputParseError);
      expect((await getDomainConfig('subservice')).revision).toBe(2);
    });

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

    it('treats a mask-shaped string as a replacement secret', async () => {
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

      const updated = await updateDomainConfig({
        domain: 'providers',
        expectedRevision: 1,
        submittedOverrides: {
          documentParse: {
            customPdf: {
              url: 'https://pdf.new-domain.com',
              key: '******'
            }
          }
        },
        actor: { actor: 'admin' }
      });

      expect(updated.effectiveConfig.documentParse.customPdf.url).toBe(
        'https://pdf.new-domain.com'
      );
      expect(updated.effectiveConfig.documentParse.customPdf.key).toBe('******');
      expect((await getDomainConfig('providers')).effectiveConfig.documentParse.customPdf.key).toBe(
        '******'
      );
    });

    describe('partial override merge', () => {
      it('preserves omitted fields when saving a partial override', async () => {
        await updateDomainConfig({
          domain: 'site',
          expectedRevision: 0,
          submittedOverrides: {
            name: 'V1',
            docUrl: 'https://custom-doc.example.com',
            scripts: [{ src: 'a.js' }]
          },
          actor: { actor: 'admin' }
        });

        const updated = await updateDomainConfig({
          domain: 'site',
          expectedRevision: 1,
          submittedOverrides: { name: 'V2' },
          actor: { actor: 'admin' }
        });

        expect(updated.overrides).toMatchObject({
          name: 'V2',
          docUrl: 'https://custom-doc.example.com',
          scripts: [{ src: 'a.js' }]
        });
        expect(updated.effectiveConfig.docUrl).toBe('https://custom-doc.example.com');
        expect(updated.effectiveConfig.scripts).toEqual([{ src: 'a.js' }]);
      });

      it('merges nested objects and preserves an omitted secret', async () => {
        const storedKey = (overrides: unknown) =>
          (overrides as { documentParse?: { customPdf?: { key?: unknown } } } | undefined)
            ?.documentParse?.customPdf?.key;
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

        const firstDoc = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
        const firstStoredOverrides = firstDoc?.overrides;
        expect(storedKey(firstStoredOverrides)).toEqual({ secret: expect.any(String) });
        expect(JSON.stringify(firstDoc?.overrides)).not.toContain('original-secret-key');

        const updated = await updateDomainConfig({
          domain: 'providers',
          expectedRevision: 1,
          submittedOverrides: {
            documentParse: {
              customPdf: {
                url: 'https://pdf.new-domain.com'
              }
            }
          },
          actor: { actor: 'admin' }
        });

        expect(updated.overrides.documentParse?.customPdf?.url).toBe('https://pdf.new-domain.com');
        expect(updated.overrides.documentParse?.customPdf?.key).toBe('original-secret-key');
        expect(updated.effectiveConfig.documentParse.customPdf.key).toBe('original-secret-key');
        const preserved = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
        expect(storedKey(preserved?.overrides)).toEqual(storedKey(firstStoredOverrides));

        const snapshot = await getSystemInstanceConfigSnapshot();
        expect(snapshot.snapshot.providers.documentParse.customPdf.key).toBe('original-secret-key');

        await updateDomainConfig({
          domain: 'providers',
          expectedRevision: 2,
          submittedOverrides: { documentParse: { customPdf: { key: 'replacement-key' } } },
          actor: { actor: 'admin' }
        });
        const replacementDoc = await MongoSystemInstanceConfig.findOne({
          domain: 'providers'
        }).lean();
        expect(storedKey(replacementDoc?.overrides)).toEqual({ secret: expect.any(String) });
        expect(storedKey(replacementDoc?.overrides)).not.toEqual(storedKey(firstStoredOverrides));
        expect(
          (await getDomainConfig('providers')).effectiveConfig.documentParse.customPdf.key
        ).toBe('replacement-key');

        await updateDomainConfig({
          domain: 'providers',
          expectedRevision: 3,
          submittedOverrides: { documentParse: { customPdf: { key: '' } } },
          actor: { actor: 'admin' }
        });
        const clearedDoc = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
        expect(clearedDoc?.overrides).not.toHaveProperty('documentParse.customPdf.key');
        expect(clearedDoc?.explicitDefaultPaths).toContain('documentParse.customPdf.key');
        expect(
          (await getDomainConfig('providers')).effectiveConfig.documentParse.customPdf.key
        ).toBe('');
      });

      it('treats an empty string as an explicit override', async () => {
        await updateDomainConfig({
          domain: 'site',
          expectedRevision: 0,
          submittedOverrides: { docUrl: 'https://custom-doc.example.com' },
          actor: { actor: 'admin' }
        });

        const updated = await updateDomainConfig({
          domain: 'site',
          expectedRevision: 1,
          submittedOverrides: { docUrl: '' },
          actor: { actor: 'admin' }
        });

        expect(updated.overrides.docUrl).toBe('');
        expect(updated.effectiveConfig.docUrl).toBe('');
      });

      it('clears an array explicitly and keeps other fields and explicit-default intent', async () => {
        await updateDomainConfig({
          domain: 'site',
          expectedRevision: 0,
          submittedOverrides: {
            name: 'Keep Me',
            docUrl: 'https://custom-doc.example.com',
            scripts: [{ src: 'a.js' }]
          },
          actor: { actor: 'admin' }
        });

        const cleared = await updateDomainConfig({
          domain: 'site',
          expectedRevision: 1,
          submittedOverrides: { scripts: [] },
          actor: { actor: 'admin' }
        });

        expect(cleared.overrides.scripts).toBeUndefined();
        expect(cleared.overrides.name).toBe('Keep Me');
        expect(cleared.overrides.docUrl).toBe('https://custom-doc.example.com');

        let doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
        expect(doc?.explicitDefaultPaths).toContain('scripts');

        // 后续局部保存不能丢掉此前“明确清空”的意图
        await updateDomainConfig({
          domain: 'site',
          expectedRevision: 2,
          submittedOverrides: { name: 'Keep Me Too' },
          actor: { actor: 'admin' }
        });

        doc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
        expect(doc?.overrides.scripts).toBeUndefined();
        expect(doc?.explicitDefaultPaths).toContain('scripts');
        expect(doc?.overrides.name).toBe('Keep Me Too');
      });

      it('leaves existing overrides unchanged when submitting an empty object', async () => {
        await updateDomainConfig({
          domain: 'site',
          expectedRevision: 0,
          submittedOverrides: { name: 'Unchanged' },
          actor: { actor: 'admin' }
        });

        const updated = await updateDomainConfig({
          domain: 'site',
          expectedRevision: 1,
          submittedOverrides: {},
          actor: { actor: 'admin' }
        });

        expect(updated.revision).toBe(2);
        expect(updated.overrides.name).toBe('Unchanged');
        expect(updated.effectiveConfig.name).toBe('Unchanged');
      });

      it('drops deprecated existing fields without blocking a partial save', async () => {
        await MongoSystemInstanceConfig.collection.insertOne({
          domain: 'site',
          schemaVersion: 1,
          revision: 1,
          overrides: {
            name: 'Legacy Name',
            deprecatedField: 'legacy-value'
          },
          explicitDefaultPaths: [],
          updatedBy: { actor: 'system' }
        });

        const updated = await updateDomainConfig({
          domain: 'site',
          expectedRevision: 1,
          submittedOverrides: { docUrl: 'https://custom-doc.example.com' },
          actor: { actor: 'admin' }
        });

        expect(updated.overrides.name).toBe('Legacy Name');
        expect(updated.overrides.docUrl).toBe('https://custom-doc.example.com');
        expect((updated.overrides as Record<string, unknown>).deprecatedField).toBeUndefined();
      });
    });
  });

  describe('getSystemInstanceConfigSnapshot', () => {
    it('publishes other scopes while retaining a damaged credential for repair', async () => {
      await batchUpdateDomainConfigs({
        items: [
          { domain: 'site', expectedRevision: 0, overrides: { name: 'Published site' } },
          {
            domain: 'providers',
            expectedRevision: 0,
            overrides: { documentParse: { customPdf: { key: 'valid-key' } } }
          }
        ],
        actor: { actor: 'admin' }
      });
      const published = await reloadSystemInstanceConfig();
      const frontend = global.feConfigs;
      const version = global.systemInitBufferId;

      await MongoSystemInstanceConfig.collection.updateOne(
        { domain: 'site' },
        { $set: { 'overrides.name': 'Unpublished site' }, $inc: { revision: 1 } }
      );
      await MongoSystemInstanceConfig.collection.updateOne(
        { domain: 'providers' },
        {
          $set: {
            'overrides.documentParse.customPdf.key': {
              secret: `${'0'.repeat(32)}:00:${'0'.repeat(32)}`
            }
          },
          $inc: { revision: 1 }
        }
      );

      await expect(reloadSystemInstanceConfig()).resolves.toBeDefined();
      expect(getSystemInstanceConfig()).not.toBe(published);
      expect(getSystemInstanceConfig().site.name).toBe('Unpublished site');
      expect(getSystemInstanceConfig().providers.documentParse.customPdf.key).toEqual({
        secret: `${'0'.repeat(32)}:00:${'0'.repeat(32)}`
      });
      expect(global.feConfigs).not.toBe(frontend);
      expect(global.systemInitBufferId).not.toBe(version);
    });

    it.each([undefined, { readPreference: 'primary' as const }])(
      'uses the primary for a snapshot with options %j',
      async (options) => {
        const read = vi.fn().mockReturnThis();
        const lean = vi.fn().mockResolvedValue([]);
        const find = vi
          .spyOn(MongoSystemInstanceConfig, 'find')
          .mockReturnValue({ read, lean, session: vi.fn().mockReturnThis() } as any);

        try {
          await getSystemInstanceConfigSnapshot(options);
          expect(read).toHaveBeenCalledExactlyOnceWith('primary');
        } finally {
          find.mockRestore();
        }
      }
    );

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

      const { snapshot } = await getSystemInstanceConfigSnapshot();
      expect(snapshot.site.name).toBe('Snapshot Site');
      expect(snapshot.performance.workflow.maxRunTimes).toBe(999);
      expect(snapshot.security.csrfEnabled).toBe(true); // default
      expect(snapshot.subservice.agentSandbox.provider).toBe('none'); // default
    });
  });

  describe('batchUpdateDomainConfigs (cross-domain atomic transaction)', () => {
    it('rejects client ciphertext wrappers without changing any domain or its existing ciphertext', async () => {
      await batchUpdateDomainConfigs({
        items: [
          { domain: 'site', expectedRevision: 0, overrides: { name: 'Before' } },
          {
            domain: 'providers',
            expectedRevision: 0,
            overrides: { documentParse: { customPdf: { key: 'original-key' } } }
          }
        ],
        actor: { actor: 'admin' }
      });
      const before = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
      const ciphertext = { secret: encryptSecret('injected-key') };

      await expect(
        batchUpdateDomainConfigs({
          items: [
            { domain: 'site', expectedRevision: 1, overrides: { name: 'Must not save' } },
            {
              domain: 'providers',
              expectedRevision: 1,
              overrides: { documentParse: { customPdf: { key: ciphertext } } }
            }
          ],
          actor: { actor: 'admin' }
        })
      ).rejects.toBeInstanceOf(ApiRequestInputParseError);

      expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
        revision: 1,
        overrides: { name: 'Before' }
      });
      const after = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
      expect(after?.revision).toBe(1);
      expect(after?.overrides).toEqual(before?.overrides);
      expect((await getDomainConfig('providers')).effectiveConfig.documentParse.customPdf.key).toBe(
        'original-key'
      );
    });

    it('rolls back already written secret and ordinary scopes on a later transaction conflict', async () => {
      await batchUpdateDomainConfigs({
        items: [
          { domain: 'site', expectedRevision: 0, overrides: { name: 'Before' } },
          {
            domain: 'providers',
            expectedRevision: 0,
            overrides: { documentParse: { customPdf: { key: 'original-key' } } }
          }
        ],
        actor: { actor: 'admin' }
      });
      const before = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
      const session = await connectionMongo.startSession();
      try {
        // 两次 site 都以 revision 1 预检；第二次写入时第一个 site 更新已使 revision 变为 2。
        await expect(
          session.withTransaction(() =>
            batchUpdateDomainConfigs(
              {
                items: [
                  {
                    domain: 'providers',
                    expectedRevision: 1,
                    overrides: { documentParse: { customPdf: { key: 'must-roll-back' } } }
                  },
                  { domain: 'site', expectedRevision: 1, overrides: { name: 'Must roll back' } },
                  { domain: 'site', expectedRevision: 1, overrides: { name: 'Conflict' } }
                ],
                actor: { actor: 'admin' }
              },
              session
            )
          )
        ).rejects.toThrow(/Revision conflict/);
      } finally {
        await session.endSession();
      }

      expect(await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean()).toMatchObject({
        revision: 1,
        overrides: { name: 'Before' }
      });
      const after = await MongoSystemInstanceConfig.findOne({ domain: 'providers' }).lean();
      expect(after?.revision).toBe(1);
      expect(after?.overrides).toEqual(before?.overrides);
      expect((await getDomainConfig('providers')).effectiveConfig.documentParse.customPdf.key).toBe(
        'original-key'
      );
    });

    it('atomically saves multiple domains in a single transaction', async () => {
      const updated = await batchUpdateDomainConfigs({
        items: [
          {
            domain: 'site',
            expectedRevision: 0,
            overrides: { name: 'Batch Site' }
          },
          {
            domain: 'auth',
            expectedRevision: 0,
            overrides: { openApiKeyMaxCount: 88 }
          }
        ],
        actor: { actor: 'admin' }
      });

      expect(updated.map((result) => result.domain)).toEqual(['site', 'auth']);
      expect(updated.map((result) => result.revision)).toEqual([1, 1]);
      expect(updated[0].effectiveConfig).toMatchObject({ name: 'Batch Site' });

      const siteDoc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
      const authDoc = await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean();

      expect(siteDoc?.overrides.name).toBe('Batch Site');
      expect(siteDoc?.revision).toBe(1);
      expect(authDoc?.overrides.openApiKeyMaxCount).toBe(88);
      expect(authDoc?.revision).toBe(1);
    });

    it('merges partial overrides with existing values in batch saves', async () => {
      await batchUpdateDomainConfigs({
        items: [
          {
            domain: 'site',
            expectedRevision: 0,
            overrides: {
              name: 'Batch V1',
              docUrl: 'https://custom-doc.example.com',
              scripts: [{ src: 'a.js' }]
            }
          }
        ],
        actor: { actor: 'admin' }
      });

      const [updated] = await batchUpdateDomainConfigs({
        items: [
          {
            domain: 'site',
            expectedRevision: 1,
            overrides: { name: 'Batch V2' }
          }
        ],
        actor: { actor: 'admin' }
      });

      expect(updated.overrides).toMatchObject({
        name: 'Batch V2',
        docUrl: 'https://custom-doc.example.com',
        scripts: [{ src: 'a.js' }]
      });
      expect(updated.effectiveConfig).toMatchObject({
        docUrl: 'https://custom-doc.example.com',
        scripts: [{ src: 'a.js' }]
      });
    });

    it.each([
      {
        domain: 'performance' as const,
        overrides: { task: { evalConcurrency: 0 } }
      },
      {
        domain: 'providers' as const,
        overrides: { documentParse: { provider: 'customPdf' } }
      },
      {
        domain: 'performance' as const,
        overrides: { workflow: { maxLoopTimes: 1 } }
      }
    ])(
      'reports invalid effective config caused by submitted values as request input errors: $domain $overrides',
      async ({ domain, overrides }) => {
        await expect(
          batchUpdateDomainConfigs({
            items: [{ domain, expectedRevision: 0, overrides }],
            actor: { actor: 'admin' }
          })
        ).rejects.toBeInstanceOf(ApiRequestInputParseError);

        expect(await MongoSystemInstanceConfig.findOne({ domain })).toBeNull();
      }
    );

    it('reads an invalid historical value, reports its save error, and allows a repair', async () => {
      await MongoSystemInstanceConfig.collection.insertOne({
        domain: 'performance',
        schemaVersion: 1,
        revision: 1,
        overrides: { workflow: { maxLoopTimes: -1 } }
      });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect((await getDomainConfig('performance')).effectiveConfig.workflow.maxLoopTimes).toBe(-1);
      expect(warn).toHaveBeenCalled();
      await expect(
        batchUpdateDomainConfigs({
          items: [
            {
              domain: 'performance',
              expectedRevision: 1,
              overrides: { dataset: { parseMaxProcess: 3 } }
            }
          ],
          actor: { actor: 'admin' }
        })
      ).rejects.toMatchObject({
        name: 'ApiRequestInputParseError',
        cause: {
          issues: expect.arrayContaining([
            expect.objectContaining({ path: ['performance', 'workflow', 'maxLoopTimes'] })
          ])
        }
      });
      const [repaired] = await batchUpdateDomainConfigs({
        items: [
          {
            domain: 'performance',
            expectedRevision: 1,
            overrides: { workflow: { maxLoopTimes: 100 } }
          }
        ],
        actor: { actor: 'admin' }
      });
      expect(repaired.effectiveConfig.workflow.maxLoopTimes).toBe(100);
      warn.mockRestore();
    });

    it('rolls back completely if any domain in the batch encounters a revision conflict', async () => {
      // 预先建立 site 文档 revision=1
      await MongoSystemInstanceConfig.create({
        domain: 'site',
        revision: 1,
        overrides: { name: 'Existing Site' },
        updatedBy: { actor: 'system' }
      });

      // 批量提交中 site 期望版本错误（传 0，实际是 1），auth 是新域（期望 0）
      await expect(
        batchUpdateDomainConfigs({
          items: [
            {
              domain: 'auth',
              expectedRevision: 0,
              overrides: { openApiKeyMaxCount: 999 }
            },
            {
              domain: 'site',
              expectedRevision: 0, // conflict!
              overrides: { name: 'Should Not Persist' }
            }
          ],
          actor: { actor: 'admin' }
        })
      ).rejects.toThrow(/Revision conflict/);

      // 确认事务全部回滚：auth 没有被创建，site 没有被修改
      const authDoc = await MongoSystemInstanceConfig.findOne({ domain: 'auth' }).lean();
      expect(authDoc).toBeNull();

      const siteDoc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
      expect(siteDoc?.overrides.name).toBe('Existing Site');
      expect(siteDoc?.revision).toBe(1);
    });

    describe('subPlans 归一化', () => {
      it('preserves plans while saving payment settings and clears plans by replacing only their subtree', async () => {
        await MongoSystemInstanceConfig.create({
          domain: 'commercial',
          revision: 1,
          overrides: { showCoupon: true, subPlans: { extraDatasetSize: { price: 7 } } }
        });
        await batchUpdateDomainConfigs({
          items: [
            {
              domain: 'commercial',
              expectedRevision: 1,
              overrides: { payFormUrl: 'https://pay.example.test' }
            }
          ],
          actor: { actor: 'admin' }
        });
        expect(
          (await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean())?.overrides
            .subPlans
        ).toEqual({ extraDatasetSize: { price: 7 } });
        await batchUpdateDomainConfigs({
          items: [],
          subPlans: {},
          subPlansExpectedRevision: 2,
          actor: { actor: 'admin' }
        });
        expect(
          await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean()
        ).toMatchObject({
          revision: 3,
          overrides: { subPlans: {}, showCoupon: true, payFormUrl: 'https://pay.example.test' }
        });
        expect(await MongoSystemInstanceConfig.countDocuments({ domain: 'subPlans' })).toBe(0);
      });
      it('rejects plans submitted through a generic commercial patch', async () => {
        await expect(
          batchUpdateDomainConfigs({
            items: [{ domain: 'commercial', expectedRevision: 0, overrides: { subPlans: {} } }],
            actor: { actor: 'admin' }
          })
        ).rejects.toMatchObject({ statusCode: 400 });
      });

      beforeEach(async () => {
        await MongoSystemConfigs.deleteMany({});
      });

      it('normalizes flat form keys into nested storage shape before persisting', async () => {
        await batchUpdateDomainConfigs({
          items: [],
          subPlans: {
            planDescriptionUrl: 'https://docs.example.com/plans',
            activityExpirationTime: '2030-01-01T00:00:00.000Z',
            extraDatasetSizePrice: 5,
            extraPointsPackages: [{ points: 1000, month: 12, price: 10 }]
          },
          subPlansExpectedRevision: 0,
          actor: { actor: 'admin' }
        });

        const doc = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
        const subPlans = doc?.overrides?.subPlans as Record<string, any>;

        // 扁平键不应残留，计费字段必须是嵌套存储形状
        expect(subPlans.extraDatasetSizePrice).toBeUndefined();
        expect(subPlans.extraPointsPackages).toBeUndefined();
        expect(subPlans.extraDatasetSize).toEqual({ price: 5 });
        expect(subPlans.extraPoints).toEqual({
          packages: [{ points: 1000, month: 12, price: 10 }]
        });
        // 字符串日期应被强转为 Date，供 Pro 与 FastGPTConfigFileSchema 消费
        expect(subPlans.activityExpirationTime).toBeInstanceOf(Date);
        expect(subPlans.planDescriptionUrl).toBe('https://docs.example.com/plans');
      });

      it('keeps already-nested keys authoritative over flat duplicates', async () => {
        await batchUpdateDomainConfigs({
          items: [],
          subPlans: {
            extraDatasetSize: { price: 9 },
            extraDatasetSizePrice: 1
          },
          subPlansExpectedRevision: 0,
          actor: { actor: 'admin' }
        });

        const doc = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
        const subPlans = doc?.overrides?.subPlans as Record<string, any>;
        expect(subPlans.extraDatasetSize).toEqual({ price: 9 });
      });

      it('rejects malformed subPlans before opening the transaction', async () => {
        // 非法积分包字段应在预校验阶段抛错，域配置完全不落库
        await expect(
          batchUpdateDomainConfigs({
            items: [{ domain: 'site', expectedRevision: 0, overrides: { name: 'X' } }],
            subPlans: {
              extraPointsPackages: [{ points: 'not-a-number', month: 1, price: 1 }]
            },
            subPlansExpectedRevision: 0,
            actor: { actor: 'admin' }
          })
        ).rejects.toThrow();

        const siteDoc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
        expect(siteDoc).toBeNull();
      });

      it('treats NaN from cleared numeric inputs as unconfigured instead of failing the save', async () => {
        // RHF valueAsNumber 对清空输入产出 NaN，等价"未配置"（对齐旧 || 0 容错）
        await batchUpdateDomainConfigs({
          items: [],
          subPlans: { extraDatasetSizePrice: Number.NaN, extraPointsPackages: Number.NaN },
          subPlansExpectedRevision: 0,
          actor: { actor: 'admin' }
        });

        const doc = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean();
        // 保存成功即验证 NaN 不再阻断整表校验；嵌套计费字段应保持缺省
        const subPlans = ((doc?.overrides?.subPlans as Record<string, any>) ?? {}) as Record<
          string,
          any
        >;
        expect(subPlans.extraDatasetSize).toBeUndefined();
        expect(subPlans.extraPoints).toBeUndefined();
      });

      it('wraps invalid subPlans as a request input error for a 400 response', async () => {
        await expect(
          batchUpdateDomainConfigs({
            items: [],
            subPlans: { planDescriptionUrl: 123 },
            subPlansExpectedRevision: 0,
            actor: { actor: 'admin' }
          })
        ).rejects.toMatchObject({ name: 'ApiRequestInputParseError' });
      });

      it('requires subPlansExpectedRevision only when subPlans is provided', async () => {
        await expect(
          batchUpdateDomainConfigs({
            items: [],
            subPlans: { extraDatasetSizePrice: 5 },
            actor: { actor: 'admin' }
          })
        ).rejects.toThrow(/subPlansExpectedRevision is required/);

        await expect(
          batchUpdateDomainConfigs({
            items: [{ domain: 'site', expectedRevision: 0, overrides: { name: 'X' } }],
            subPlansExpectedRevision: 0,
            actor: { actor: 'admin' }
          })
        ).rejects.toThrow(/subPlansExpectedRevision is only allowed/);
      });

      it('rejects a plan save when the commercial item revision differs', async () => {
        await MongoSystemInstanceConfig.create({
          domain: 'commercial',
          revision: 1,
          overrides: { showCoupon: true },
          updatedBy: { actor: 'system' }
        });

        await expect(
          batchUpdateDomainConfigs({
            items: [{ domain: 'commercial', expectedRevision: 1, overrides: {} }],
            subPlans: { extraDatasetSizePrice: 5 },
            subPlansExpectedRevision: 0,
            actor: { actor: 'admin' }
          })
        ).rejects.toThrow(/Revision conflict for subPlans/);

        expect(
          (await MongoSystemInstanceConfig.findOne({ domain: 'commercial' }).lean())?.overrides
        ).not.toHaveProperty('subPlans');
        const commercialDoc = await MongoSystemInstanceConfig.findOne({
          domain: 'commercial'
        }).lean();
        expect(commercialDoc?.revision).toBe(1);
      });

      it('saves plans with a matching commercial revision and preserves commercial overrides', async () => {
        await MongoSystemInstanceConfig.create({
          domain: 'commercial',
          revision: 1,
          overrides: { showCoupon: true },
          updatedBy: { actor: 'system' }
        });

        const results = await batchUpdateDomainConfigs({
          items: [
            {
              domain: 'commercial',
              expectedRevision: 1,
              overrides: { payFormUrl: 'https://pay.example.com' }
            }
          ],
          subPlans: { extraDatasetSizePrice: 5 },
          subPlansExpectedRevision: 1,
          actor: { actor: 'admin' }
        });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ domain: 'commercial', revision: 2 });

        const commercialDoc = await MongoSystemInstanceConfig.findOne({
          domain: 'commercial'
        }).lean();
        expect(commercialDoc).toMatchObject({
          revision: 2,
          overrides: {
            showCoupon: true,
            payFormUrl: 'https://pay.example.com'
          }
        });

        const planDoc = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' })
          .sort({ createTime: -1 })
          .lean();
        expect(planDoc?.overrides).toMatchObject({ subPlans: { extraDatasetSize: { price: 5 } } });
        expect(await MongoSystemConfigs.countDocuments({ type: 'fastgpt' })).toBe(0);
      });

      it('synthesizes a commercial revision bump for plan-only saves and rejects stale retries', async () => {
        await MongoSystemInstanceConfig.create({
          domain: 'commercial',
          revision: 2,
          overrides: { showCoupon: true },
          updatedBy: { actor: 'system' }
        });

        const results = await batchUpdateDomainConfigs({
          items: [],
          subPlans: { extraDatasetSizePrice: 7 },
          subPlansExpectedRevision: 2,
          actor: { actor: 'admin' }
        });

        // 自动补充的 commercial 更新只用于加锁，不出现在返回结果中
        expect(results).toEqual([]);
        const commercialDoc = await MongoSystemInstanceConfig.findOne({
          domain: 'commercial'
        }).lean();
        expect(commercialDoc).toMatchObject({
          revision: 3,
          overrides: { showCoupon: true }
        });

        const firstPlan = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' })
          .sort({ createTime: -1 })
          .lean();
        expect(firstPlan?.overrides).toMatchObject({
          subPlans: { extraDatasetSize: { price: 7 } }
        });

        await expect(
          batchUpdateDomainConfigs({
            items: [],
            subPlans: { extraDatasetSizePrice: 8 },
            subPlansExpectedRevision: 2,
            actor: { actor: 'admin' }
          })
        ).rejects.toThrow(/Revision conflict/);

        const latestPlan = await MongoSystemInstanceConfig.findOne({ domain: 'commercial' })
          .sort({ createTime: -1 })
          .lean();
        expect(latestPlan?.overrides).toMatchObject({
          subPlans: { extraDatasetSize: { price: 7 } }
        });
      });
    });

    it('preserves newly saved explicit default markers even when existing explicitDefaultPaths has 200+ entries', async () => {
      const legacyMarkers = Array.from({ length: 205 }, (_, i) => `legacy.marker.${i}`);
      await MongoSystemInstanceConfig.create({
        domain: 'site',
        schemaVersion: 1,
        revision: 1,
        overrides: { description: 'custom' },
        explicitDefaultPaths: legacyMarkers,
        updatedBy: { actor: 'system' }
      });

      await updateDomainConfig({
        domain: 'site',
        expectedRevision: 1,
        submittedOverrides: { description: '' },
        actor: { actor: 'admin' }
      });

      const siteDoc = await MongoSystemInstanceConfig.findOne({ domain: 'site' }).lean();
      expect(siteDoc?.overrides).toEqual({});
      expect(siteDoc?.explicitDefaultPaths).toHaveLength(206);
      expect(siteDoc?.explicitDefaultPaths).toContain('description');
    });
  });
});
