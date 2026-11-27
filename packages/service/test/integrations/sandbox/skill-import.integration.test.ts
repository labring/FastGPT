import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { importSkill } from '@fastgpt/service/core/ai/skill/manage';
import { deleteSkillPackage } from '@fastgpt/service/core/ai/skill/package/storage';
import {
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { getSandboxStaticRuntimePaths } from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/runtimeProfile';
import { joinSandboxPath } from '@fastgpt/service/core/ai/sandbox/utils';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/resource';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getSandboxIntegrationProvider } from './config';

const integrationProvider = getSandboxIntegrationProvider();

/** 创建一个真实导入 `.zip` 包，故意不写入根目录 `.gitignore`。 */
const createImportedSkillPackage = async (): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file('SKILL.md', '# Imported skill\n\nThis package intentionally has no gitignore.\n');
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe.skipIf(!integrationProvider).sequential('Skill import Sandbox Integration', () => {
  const originalConfig = global.systemInstanceConfig;
  const originalSandboxBucket = global.sandboxBucket;
  const originalSkillBucket = global.skillBucket;
  const cleanupArchive = vi.fn(async () => undefined);

  afterEach(async () => {
    global.systemInstanceConfig = originalConfig;
    global.sandboxBucket = originalSandboxBucket;
    global.skillBucket = originalSkillBucket;
  });

  it('creates the Skill Edit sandbox for an imported package without .gitignore', async () => {
    const snapshot = getTestInstanceConfig();
    global.systemInstanceConfig = {
      ...snapshot,
      subservice: {
        ...snapshot.subservice,
        agentSandbox: { ...snapshot.subservice.agentSandbox, enabled: true }
      }
    };
    global.sandboxBucket = {
      deleteSandboxArchives: cleanupArchive
    } as unknown as typeof global.sandboxBucket;

    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const packageBuffer = await createImportedSkillPackage();
    const importedZip = await JSZip.loadAsync(packageBuffer);
    expect(importedZip.file('.gitignore')).toBeNull();
    let storedPackage: Buffer | undefined;
    const consumeUploadBody = async (body: Buffer | Readable) => {
      if (Buffer.isBuffer(body)) return body;
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    };
    global.skillBucket = {
      uploadPackage: vi.fn(
        async ({
          teamId: uploadTeamId,
          skillId: uploadSkillId,
          packageObjectId,
          body,
          extension = 'tar.zst'
        }: {
          teamId: string;
          skillId: string;
          packageObjectId: string;
          body: Buffer | Readable;
          extension?: string;
        }) => {
          storedPackage = await consumeUploadBody(body);
          return {
            key: `agent-skills/${uploadTeamId}/${uploadSkillId}/${packageObjectId}.${extension}`
          };
        }
      ),
      uploadPackageStream: vi.fn(
        async ({
          teamId: uploadTeamId,
          skillId: uploadSkillId,
          packageObjectId,
          body,
          extension = 'tar.zst'
        }: {
          teamId: string;
          skillId: string;
          packageObjectId: string;
          body: Readable;
          extension?: string;
        }) => {
          storedPackage = await consumeUploadBody(body);
          return {
            key: `agent-skills/${uploadTeamId}/${uploadSkillId}/${packageObjectId}.${extension}`,
            sizeBytes: storedPackage.length
          };
        }
      ),
      removePackageTTL: vi.fn(async () => undefined),
      client: {
        getObjectMetadata: vi.fn(async ({ key }: { key: string }) => ({
          bucket: 'test-bucket',
          key,
          metadata: {},
          contentLength: storedPackage?.length ?? 0
        })),
        downloadObject: vi.fn(async ({ range }: { range?: { start: number; end: number } }) => ({
          body: Readable.from([
            storedPackage && range
              ? storedPackage.subarray(range.start, range.end + 1)
              : storedPackage
          ])
        })),
        deleteObject: vi.fn(async () => undefined)
      }
    } as unknown as typeof global.skillBucket;

    const skillId = await importSkill({
      skill: {
        name: `Imported skill ${randomUUID()}`,
        description: 'Skill import sandbox integration',
        category: []
      },
      teamId,
      tmbId,
      packageStream: Readable.from(packageBuffer),
      contentLength: packageBuffer.length
    });

    const skillVersion = await MongoAgentSkillsVersion.findOne({ skillId }).lean();
    if (!skillVersion) throw new Error(`Imported skill version not found: ${skillId}`);

    const sandboxId = getEditDebugSandboxId(skillId);
    let sandboxClient: Awaited<ReturnType<typeof getSandboxClient>> | undefined;

    try {
      const context = await getSkillEditRuntimeContext({ skillId, teamId });
      expect(context.existingInstance).toBeNull();

      await initSkillEditRuntimeSandbox({ context });

      sandboxClient = await getSandboxClient({
        sandboxId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      });

      const workDirectory = getSandboxStaticRuntimePaths().workDirectory;
      const [gitignore, skillMd] = await sandboxClient.opensandbox.readFiles([
        joinSandboxPath(workDirectory, '.gitignore'),
        joinSandboxPath(workDirectory, 'SKILL.md')
      ]);

      expect(gitignore?.error).toBeNull();
      expect(Buffer.from(gitignore?.content ?? []).toString()).toContain('node_modules');
      expect(skillMd?.error).toBeNull();
    } finally {
      await sandboxClient?.opensandbox.close().catch(() => undefined);

      const sandboxInstance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      if (sandboxInstance) {
        await deleteSandboxResource(sandboxInstance);
      }
      await deleteSkillPackage(skillVersion.storageKey);
      await MongoAgentSkillsVersion.deleteMany({ skillId });
      await MongoAgentSkills.deleteOne({ _id: skillId });
    }

    expect(cleanupArchive).toHaveBeenCalledWith(expect.objectContaining({ sandboxId }));
  });
});
