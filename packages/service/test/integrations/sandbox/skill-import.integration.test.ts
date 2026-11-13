import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { importSkill } from '@fastgpt/service/core/ai/skill/manage';
import { deleteSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import {
  getSkillEditRuntimeContext,
  initSkillEditRuntimeSandbox,
  packageSkillEditWorkspace
} from '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime';
import {
  getAgentSkillInfos,
  injectAgentSkillFilesToSandbox
} from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/core';
import { runAgentSkillVersionEntrypoints } from '@fastgpt/service/core/ai/sandbox/application/runtime/skill/entrypoint';
import {
  EDIT_DEBUG_SANDBOX_CHAT_ID,
  getEditDebugSandboxId
} from '@fastgpt/service/core/ai/skill/edit/config';
import { getSandboxClient } from '@fastgpt/service/core/ai/sandbox/application/runtime/client';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { joinSandboxPath } from '@fastgpt/service/core/ai/sandbox/utils';
import { deleteSandboxResource } from '@fastgpt/service/core/ai/sandbox/application/resource';
import { getSessionVolumeClaimName } from '@fastgpt/service/core/ai/sandbox/infrastructure/volume/service';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/infrastructure/instance/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isSandboxIntegrationEnabled } from './config';

const integrationEnabled = isSandboxIntegrationEnabled();

/** 创建一个真实导入包，故意不写入根目录 `.gitignore`。 */
const createImportedSkillPackage = async (): Promise<Buffer> => {
  const zip = new JSZip();
  zip.file(
    'SKILL.md',
    '---\nname: imported-integration-skill\ndescription: Imported integration skill\n---\n# Imported skill\n\nThis package intentionally has no gitignore.\n'
  );
  zip.file('entrypoint.sh', '#!/bin/bash\necho "skill-entrypoint-executed" >> skill-ep.log\n');
  return zip.generateAsync({ type: 'nodebuffer' });
};

describe.skipIf(!integrationEnabled).sequential('Skill import Sandbox Integration', () => {
  const originalFeConfigs = global.feConfigs;
  const originalSkillBucket = global.skillBucket;

  afterEach(async () => {
    global.feConfigs = originalFeConfigs;
    global.skillBucket = originalSkillBucket;
  });

  it('creates Skill Edit sandbox, skips warm-start re-download, packages workspace with .gitignore, and deploys to App sandbox', async () => {
    global.feConfigs = {
      ...(originalFeConfigs ?? {}),
      show_agent_sandbox: true
    } as typeof global.feConfigs;

    const teamId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const packageBuffer = await createImportedSkillPackage();
    const importedZip = await JSZip.loadAsync(packageBuffer);
    expect(importedZip.file('.gitignore')).toBeNull();
    let storedPackage: Buffer | undefined;
    const downloadObjectMock = vi.fn(async () => ({
      body: Readable.from([storedPackage])
    }));
    global.skillBucket = {
      uploadPackage: vi.fn(
        async ({
          teamId: uploadTeamId,
          skillId: uploadSkillId,
          packageObjectId,
          body
        }: {
          teamId: string;
          skillId: string;
          packageObjectId: string;
          body: Buffer | Readable;
        }) => {
          const chunks: Buffer[] = [];
          for await (const chunk of Readable.from(body)) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          storedPackage = Buffer.concat(chunks);
          return {
            key: `agent-skills/${uploadTeamId}/${uploadSkillId}/${packageObjectId}.zip`
          };
        }
      ),
      removePackageTTL: vi.fn(async () => undefined),
      client: {
        downloadObject: downloadObjectMock,
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

    const skillDoc = await MongoAgentSkills.findById(skillId).lean();
    const skillVersion = await MongoAgentSkillsVersion.findOne({ skillId }).lean();
    if (!skillDoc || !skillVersion) throw new Error(`Imported skill version not found: ${skillId}`);

    const sandboxId = getEditDebugSandboxId(skillId);
    let sandboxClient: Awaited<ReturnType<typeof getSandboxClient>> | undefined;
    const app = await MongoApp.create({
      name: `Skill consumer app ${randomUUID()}`,
      type: AppTypeEnum.simple,
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId),
      modules: []
    });
    const appId = String(app._id);
    const appSandboxId = getRunningSandboxId({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: tmbId
    });
    let appSandboxClient: Awaited<ReturnType<typeof getSandboxClient>> | undefined;

    try {
      const context = await getSkillEditRuntimeContext({ skillId, teamId });

      // 1. 冷启动：首次初始化应下载解压 Skill 包并生成默认 .gitignore
      await initSkillEditRuntimeSandbox({ context });
      expect(downloadObjectMock).toHaveBeenCalledTimes(1);

      const editInstance = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      expect(getSessionVolumeClaimName(editInstance?.storage)).toMatch(/^fastgpt-/);

      // 2. 热启动：重新获取 context 后同一版本再次初始化应跳过 S3 下载解压
      const warmContext = await getSkillEditRuntimeContext({ skillId, teamId });
      await initSkillEditRuntimeSandbox({ context: warmContext });
      expect(downloadObjectMock).toHaveBeenCalledTimes(1);

      sandboxClient = await getSandboxClient({
        sandboxId,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        userId: ChatSourceTypeEnum.skillEdit,
        chatId: EDIT_DEBUG_SANDBOX_CHAT_ID
      });

      const workDirectory = context.runtimeProfile.workDirectory;
      const [gitignore, skillMd] = await sandboxClient.opensandbox.readFiles([
        joinSandboxPath(workDirectory, '.gitignore'),
        joinSandboxPath(workDirectory, 'SKILL.md')
      ]);

      expect(gitignore?.error).toBeNull();
      expect(Buffer.from(gitignore?.content ?? []).toString()).toContain('node_modules');
      expect(skillMd?.error).toBeNull();

      // 3. 在工作区写入业务文件与应被忽略的目录，验证 packageSkillEditWorkspace 过滤规则
      await sandboxClient.exec(
        'mkdir -p src node_modules/fake .venv && printf "export const ok = 1;" > src/index.ts && printf "ignored" > node_modules/fake/index.js && printf "ignored" > .venv/pyvenv.cfg && printf "ignored" > package.zip'
      );
      const zipBuffer = await packageSkillEditWorkspace({
        skillId,
        teamId,
        validationMode: 'basicZip'
      });
      const exportedZip = await JSZip.loadAsync(zipBuffer);
      expect(exportedZip.file('SKILL.md')).not.toBeNull();
      expect(exportedZip.file('src/index.ts')).not.toBeNull();
      expect(exportedZip.file('node_modules/fake/index.js')).toBeNull();
      expect(exportedZip.file('.venv/pyvenv.cfg')).toBeNull();
      expect(exportedZip.file('package.zip')).toBeNull();

      // 4. 将已发布 Skill 版本部署至 App 沙箱，验证缓存复用、旧版本清理与 entrypoint 幂等执行
      appSandboxClient = await getSandboxClient({
        sandboxId: appSandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        userId: tmbId,
        chatId: 'skill-deploy-chat'
      });
      const appWorkspaceRoot = appSandboxClient.getRuntimePaths().workspaceRoot;
      const fakeOldVersionDir = joinSandboxPath(
        appWorkspaceRoot,
        'projects',
        new Types.ObjectId().toString()
      );
      const fakeStaleTempDir = joinSandboxPath(appWorkspaceRoot, 'projects', '.tmp-stale-123');
      await appSandboxClient.opensandbox.createDirectories([fakeOldVersionDir, fakeStaleTempDir]);

      const deployed = await injectAgentSkillFilesToSandbox({
        sandbox: appSandboxClient.opensandbox,
        skills: [skillDoc],
        workDirectory: appWorkspaceRoot
      });
      expect(deployed).toHaveLength(1);
      expect(deployed[0].versionId).toBe(String(skillVersion._id));

      // 第二次注入同一版本应直接复用已部署目录，不重复下载
      const downloadsBeforeReuse = downloadObjectMock.mock.calls.length;
      await injectAgentSkillFilesToSandbox({
        sandbox: appSandboxClient.opensandbox,
        skills: [skillDoc],
        workDirectory: appWorkspaceRoot
      });
      expect(downloadObjectMock.mock.calls.length).toBe(downloadsBeforeReuse);

      // 连续两次执行 skill entrypoint，脚本只应执行一次
      await runAgentSkillVersionEntrypoints({
        sandbox: appSandboxClient.opensandbox,
        versions: deployed
      });
      await runAgentSkillVersionEntrypoints({
        sandbox: appSandboxClient.opensandbox,
        versions: deployed
      });
      const epLog = await appSandboxClient.opensandbox.execute(
        `wc -l < ${deployed[0].targetDir}/skill-ep.log`
      );
      expect(epLog.exitCode).toBe(0);
      expect(epLog.stdout.trim()).toBe('1');

      // 扫描 SKILL.md 并校验旧版本与残留临时目录已被清理
      const infos = await getAgentSkillInfos({
        sandbox: appSandboxClient.opensandbox,
        skillDirectories: [deployed[0].targetDir],
        deployedSkillVersions: deployed
      });
      expect(infos).toHaveLength(1);
      expect(infos[0].name).toBe('imported-integration-skill');
      expect(infos[0].appId).toBe(skillId);

      const projectEntries = await appSandboxClient.opensandbox.listDirectory(
        joinSandboxPath(appWorkspaceRoot, 'projects')
      );
      expect(projectEntries.map((entry) => entry.path).sort()).toEqual(
        [deployed[0].targetDir, fakeOldVersionDir].sort()
      );
    } finally {
      await sandboxClient?.opensandbox.close().catch(() => undefined);
      await appSandboxClient?.opensandbox.close().catch(() => undefined);

      for (const id of [sandboxId, appSandboxId]) {
        const instance = await MongoSandboxInstance.findOne({ sandboxId: id }).lean();
        if (instance) {
          await deleteSandboxResource(instance);
        }
      }
      await deleteSkillPackage(skillVersion.storageKey);
      await MongoAgentSkillsVersion.deleteMany({ skillId });
      await MongoAgentSkills.deleteOne({ _id: skillId });
      await MongoApp.deleteOne({ _id: appId });
    }
  });
});
