import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { readHttpResult } from './scenario.mjs';

/**
 * 构造统一的 `/api/core/ai/sandbox/upload` 原始字节流上传请求，支持 Key、Cookie 与匿名分享态。
 */
export async function uploadSandboxBytes(
  c,
  { query, content = '', role = 'A', kind, keyValue, extraHeaders }
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
  const bytes =
    Buffer.isBuffer(content) || content instanceof Uint8Array
      ? Buffer.from(content)
      : Buffer.from(String(content), 'utf8');
  return c.request({
    role,
    kind,
    keyValue,
    route: `/api/core/ai/sandbox/upload?${searchParams.toString()}`,
    body: bytes,
    extraHeaders
  });
}

/**
 * 调用统一的 `/api/core/ai/sandbox/download` 单文件字节流读取接口，返回字节、UTF-8 文本与 ETag。
 */
export async function downloadSandboxFile(c, { body, role = 'A', kind, keyValue, extraHeaders }) {
  const response = await c.request({
    role,
    kind,
    keyValue,
    route: '/api/core/ai/sandbox/download',
    body,
    raw: true,
    extraHeaders
  });
  if (response.status >= 400) {
    return readHttpResult(response);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const etag = response.headers.get('etag') ?? undefined;
  return {
    http: response.status,
    error: false,
    bytes,
    text: bytes.toString('utf8'),
    etag,
    size: Number(response.headers.get('content-length') ?? bytes.byteLength),
    json: {
      code: 200,
      data: {
        bytes,
        text: bytes.toString('utf8'),
        etag,
        size: Number(response.headers.get('content-length') ?? bytes.byteLength)
      }
    }
  };
}

/**
 * 从 Mongo 沙箱实例记录中提取持久卷 claimName。
 */
export function getInstanceClaimName(instance) {
  return instance?.storage?.volumes?.[0]?.claimName ?? instance?.storage?.claimName;
}

/**
 * 为指定测试应用开启产品态沙箱权限与版本节点开关，并登记自动回收与沙箱级联清理。
 */
export async function enableSandboxForApp(w, context, appId = w.W) {
  const plan = await w.db
    .collection('team_subscriptions')
    .findOne({ teamId: w.teamId, type: 'standard' });
  if (plan) {
    await w.db
      .collection('team_subscriptions')
      .updateOne({ _id: plan._id }, { $set: { enableSandbox: true, maxApp: 100 } });
    context.itemFinalizers.push(() =>
      w.db
        .collection('team_subscriptions')
        .updateOne(
          { _id: plan._id },
          Object.hasOwn(plan, 'enableSandbox')
            ? { $set: { enableSandbox: plan.enableSandbox } }
            : { $unset: { enableSandbox: 1 } }
        )
    );
  } else {
    const now = new Date();
    const expiredTime = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
    await w.db.collection('team_subscriptions').insertOne({
      teamId: w.teamId,
      type: 'standard',
      currentMode: 'month',
      nextMode: 'month',
      startTime: now,
      expiredTime,
      currentSubLevel: 'free',
      nextSubLevel: 'free',
      totalPoints: 100000,
      surplusPoints: 100000,
      maxApp: 100,
      enableSandbox: true
    });
  }
  const version = await w.db
    .collection('app_versions')
    .findOne({ appId: w.oid(appId), isPublish: true }, { sort: { time: -1 } });
  const capabilityNode = {
    nodeId: 'FG-TEST-sandbox-capability',
    flowNodeType: 'agent',
    inputs: [
      { key: 'useAgentSandbox', value: true, renderTypeList: ['switch'], valueType: 'boolean' }
    ],
    outputs: []
  };
  await w.db
    .collection('app_versions')
    .updateOne({ _id: version._id }, { $set: { nodes: [...version.nodes, capabilityNode] } });
  context.itemFinalizers.push(() =>
    w.db
      .collection('app_versions')
      .updateOne({ _id: version._id }, { $set: { nodes: version.nodes } })
  );
  context.itemFinalizers.push(() =>
    invokeSandboxService(context, w.c, 'cascade-delete-source', {
      sourceType: 'app',
      sourceId: appId
    })
  );
  context.resources.set('sandbox:' + appId, true);
}

/**
 * 在测试子进程中调用真实沙箱与 Skill 服务层能力，凭证经 stdin 传入且严格限定于 FG-TEST 团队。
 */
export async function invokeSandboxService(context, c, operation, extra = {}) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), 180_000);
  child.stdin.end(
    JSON.stringify({
      operation,
      environmentFile: c.secret(
        c.fixture.serviceEnvFileEnv ?? c.fixture.privateEnvironment?.serviceEnvFileEnv
      ),
      teamId: c.fixture.teamId,
      ...extra
    })
  );
  const code = await new Promise((resolve, reject) => {
    child.once('exit', (exitCode) => resolve(exitCode));
    child.once('error', reject);
  }).finally(() => clearTimeout(timer));

  const errorLine = stdout.split('\n').find((line) => line.startsWith('FG_SANDBOX_ERROR='));
  const parsedError = errorLine
    ? JSON.parse(errorLine.slice('FG_SANDBOX_ERROR='.length))
    : undefined;
  assert.equal(
    code,
    0,
    `sandbox-service(${operation}) 失败：` +
      (parsedError ? `${parsedError.name}: ${parsedError.message}` : stderr.slice(-500))
  );
  const resultLine = stdout.split('\n').find((line) => line.startsWith('FG_SANDBOX_RESULT='));
  assert.ok(resultLine, `sandbox-service(${operation}) 未返回结果`);
  const result = JSON.parse(resultLine.slice('FG_SANDBOX_RESULT='.length));
  c.record('Sandbox 服务执行结果', { operation, result });
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let rawInput = '';
  for await (const chunk of process.stdin) rawInput += chunk;
  const input = JSON.parse(rawInput);
  const env = JSON.parse(await readFile(input.environmentFile, 'utf8'));
  Object.assign(process.env, env);
  const appConfig = fileURLToPath(new URL('../../../projects/app/tsconfig.json', import.meta.url));
  process.env.TSX_TSCONFIG_PATH = appConfig;
  const req = createRequire(new URL('../../../projects/app/package.json', import.meta.url));
  const unregisterEsm = req('tsx/esm/api').register({ tsconfig: appConfig });
  const tsx = req('tsx/cjs/api');
  const load = (file) =>
    tsx.require(
      fileURLToPath(new URL('../../../' + file, import.meta.url)),
      fileURLToPath(import.meta.url)
    );

  let mongo;
  try {
    mongo = load('packages/service/common/mongo/index.ts');
    await mongo.connectionMongo.connect(env.MONGODB_URI);
    await mongo.connectionLogMongo.connect(env.MONGODB_LOG_URI ?? env.MONGODB_URI);
    const db = mongo.connectionMongo.connection.db;
    const team = await db
      .collection('teams')
      .findOne({ _id: new mongo.Types.ObjectId(input.teamId) });
    assert.ok(team && /^FG-TEST(?:[- ])/.test(team.name ?? ''), '服务操作仅限 FG-TEST 测试团队');
    const redis = load('packages/dal/redis/runtime/index.ts');
    await redis.configureRedisRuntime({ redisUrl: env.REDIS_URL });
    const { initS3Buckets } = load('packages/service/common/s3/index.ts');
    initS3Buckets();
    global.feConfigs = { ...(global.feConfigs ?? {}), show_agent_sandbox: true };

    const { getInstanceId } = load('packages/service/common/system/config/instanceId.ts');
    const deploymentId = await getInstanceId();

    const { MongoSandboxInstance } = load(
      'packages/service/core/ai/sandbox/infrastructure/instance/schema.ts'
    );
    const {
      stopSandboxResource,
      deleteSandboxResource,
      deleteSandboxResourcesBySource,
      deleteSkillEditSandboxes,
      retryStaleStoppingSandboxes,
      reconcileOrphanSandboxContainers,
      reconcileOrphanSandboxVolumes
    } = load('packages/service/core/ai/sandbox/application/resource.ts');
    const { retryStaleSandboxActivations } = load(
      'packages/service/core/ai/sandbox/application/lifecycle/service.ts'
    );
    const { getSandboxClient } = load(
      'packages/service/core/ai/sandbox/application/runtime/client.ts'
    );
    const { getRunningSandboxId } = load('packages/service/core/ai/sandbox/utils/id.ts');
    const {
      ensureSessionVolume,
      unmountSessionVolume,
      deleteSessionVolume,
      listSessionVolumes,
      getSessionVolumeClaimName
    } = load('packages/service/core/ai/sandbox/infrastructure/volume/service.ts');
    const { asRedisLogicalKey, redisCacheAdapter } = load('packages/dal/redis/adapter.ts');

    let result;
    if (input.operation === 'enable-app-sandbox') {
      const teamOid = new mongo.Types.ObjectId(input.teamId);
      const now = new Date();
      await db.collection('team_subscriptions').updateOne(
        { teamId: teamOid, type: 'standard' },
        {
          $set: { enableSandbox: true, maxApp: 100 },
          $setOnInsert: {
            currentMode: 'month',
            nextMode: 'month',
            startTime: now,
            expiredTime: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
            currentSubLevel: 'free',
            nextSubLevel: 'free',
            totalPoints: 100000,
            surplusPoints: 100000
          }
        },
        { upsert: true }
      );
      if (input.appId) {
        const appOid = new mongo.Types.ObjectId(input.appId);
        const version = await db
          .collection('app_versions')
          .findOne({ appId: appOid }, { sort: { time: -1 } });
        if (version) {
          const capabilityNode = {
            nodeId: 'FG-TEST-sandbox-capability',
            flowNodeType: 'agent',
            inputs: [
              {
                key: 'useAgentSandbox',
                value: true,
                renderTypeList: ['switch'],
                valueType: 'boolean'
              }
            ],
            outputs: []
          };
          await db.collection('app_versions').updateMany(
            { appId: appOid },
            {
              $set: {
                isPublish: true,
                nodes: [...(version.nodes ?? []), capabilityNode]
              }
            }
          );
        }
      }
      result = { enabled: true, appId: input.appId };
    } else if (input.operation === 'stop-sandbox') {
      await stopSandboxResource({ sandboxId: input.sandboxId });
      const instance = await MongoSandboxInstance.findOne({ sandboxId: input.sandboxId }).lean();
      result = {
        sandboxId: input.sandboxId,
        status: instance?.status,
        claimName: getSessionVolumeClaimName(instance?.storage)
      };
    } else if (input.operation === 'delete-sandbox') {
      await deleteSandboxResource({ sandboxId: input.sandboxId });
      const exists = await MongoSandboxInstance.exists({ sandboxId: input.sandboxId });
      result = { sandboxId: input.sandboxId, deleted: !exists };
    } else if (input.operation === 'volume-manager-lifecycle') {
      const claimName = input.claimName;
      assert.match(claimName, /^fastgpt-(?:session-|ws-)?fgtest-/);
      const { getVolumeManagerEnvConfig } = load(
        'packages/service/core/ai/sandbox/infrastructure/volume/config.ts'
      );
      const vmConfig = getVolumeManagerEnvConfig();
      const baseUrl = vmConfig.url.replace(/\/+$/, '');
      const headers = {
        'content-type': 'application/json',
        ...(vmConfig.token ? { authorization: `Bearer ${vmConfig.token}` } : {})
      };
      try {
        // 1. 首次 ensure 返回 201
        const res1 = await fetch(`${baseUrl}/v1/volumes/ensure`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ claimName, deploymentId })
        });
        const body1 = await res1.json();
        assert.equal(res1.status, 201);
        assert.equal(body1.created, true);

        // 2. 幂等二次 ensure 返回 200
        const res2 = await fetch(`${baseUrl}/v1/volumes/ensure`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ claimName, deploymentId })
        });
        const body2 = await res2.json();
        assert.equal(res2.status, 200);
        assert.equal(body2.created, false);

        // 3. list 包含该 claimName
        const listed = await listSessionVolumes();
        assert.ok(listed.includes(claimName));

        // 4. unmount 卸载 FUSE
        await unmountSessionVolume(claimName);

        // 5. 唤醒重挂 ensure
        await ensureSessionVolume(claimName);

        // 6. delete 物理删除
        await deleteSessionVolume(claimName);
        const listedAfter = await listSessionVolumes();
        assert.ok(!listedAfter.includes(claimName));

        result = {
          claimName,
          firstStatus: res1.status,
          secondStatus: res2.status,
          firstEnsureStatus: res1.status,
          secondEnsureStatus: res2.status,
          inListBeforeRemove: true,
          inListAfterRemove: false,
          unmountedAndRemounted: true,
          removedFromList: true
        };
      } finally {
        await deleteSessionVolume(claimName).catch(() => undefined);
      }
    } else if (input.operation === 'upgrade-sandbox') {
      const before = await MongoSandboxInstance.findOne(
        input.sandboxId
          ? { sandboxId: input.sandboxId }
          : {
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              userId: input.userId
            }
      ).lean();
      assert.ok(before, '待升级沙箱记录必须存在');
      await MongoSandboxInstance.updateOne(
        { _id: before._id },
        {
          $set: {
            image: `${(before.image ?? 'fastgpt-agent-sandbox').split(':')[0]}:outdated-integration-tag`
          }
        }
      );
      let upgradeCallbackFired = false;
      const client = await getSandboxClient(
        {
          sandboxId: before.sandboxId,
          sourceType: before.sourceType,
          sourceId: before.sourceId,
          userId: before.userId,
          chatId: input.chatId
        },
        {
          onUpgrade: () => {
            upgradeCallbackFired = true;
          }
        }
      );
      await client.close();
      const afterResume = await MongoSandboxInstance.findOne({ _id: before._id }).lean();
      result = {
        upgraded: upgradeCallbackFired,
        upgradeCallbackFired,
        statusAfterConfig: afterResume?.status,
        statusAfterResume: afterResume?.status,
        statusAfterWake: afterResume?.status,
        claimNameBefore: getSessionVolumeClaimName(before.storage),
        claimNameAfter: getSessionVolumeClaimName(afterResume?.storage),
        claimPreserved:
          getSessionVolumeClaimName(before.storage) ===
          getSessionVolumeClaimName(afterResume?.storage),
        imageRestored: afterResume?.image === before.image,
        instanceIdRotated: before.instanceId !== afterResume?.instanceId
      };
    } else if (input.operation === 'stale-and-orphan-gc') {
      const { sandboxId, orphanClaimName } = input;
      assert.match(orphanClaimName, /^fastgpt-(?:session-|ws-)?fgtest-orphan-/);
      // 1) Stale provisioning 回滚验证
      const before = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      assert.ok(before);
      const staleAt = new Date(Date.now() - 20 * 60 * 1000);
      await MongoSandboxInstance.updateOne(
        { _id: before._id },
        {
          $set: {
            status: 'provisioning',
            operation: {
              id: 'stale-op-' + Date.now(),
              type: 'provision',
              phase: 'claimed',
              startedAt: staleAt,
              heartbeatAt: staleAt,
              failedAt: staleAt,
              error: 'simulated stale provision'
            }
          }
        }
      );
      await retryStaleSandboxActivations(new Date());
      const afterRollback = await MongoSandboxInstance.findOne({ sandboxId }).lean();
      assert.equal(afterRollback?.status, 'stopped');

      // 2) 孤儿卷两阶段 GC 验证（首次打标保留，超 30m 宽限期二次扫描删除）
      await ensureSessionVolume(orphanClaimName);
      const markerKey = asRedisLogicalKey(`sandbox:gc:orphan-volume:${orphanClaimName}`);
      try {
        await reconcileOrphanSandboxVolumes(new Date());
        const markerAfterPass1 = await redisCacheAdapter.get(markerKey);
        assert.ok(markerAfterPass1, '首次扫描应写入 Redis 孤儿卷打标');
        const listAfterPass1 = await listSessionVolumes();
        assert.ok(listAfterPass1.includes(orphanClaimName), '首次扫描在宽限期内不应物理删除卷');

        // 推进时间至 35 分钟后（超过 30m 宽限期），再次执行 GC
        await reconcileOrphanSandboxVolumes(new Date(Date.now() + 35 * 60 * 1000));
        const listAfterPass2 = await listSessionVolumes();
        assert.ok(
          !listAfterPass2.includes(orphanClaimName),
          '超过 30 分钟宽限期二次扫描应物理删除孤儿卷'
        );
        result = {
          staleProvisionRolledBackTo: afterRollback?.status,
          orphanVolumeMarkedOnPass1: Boolean(markerAfterPass1),
          orphanVolumeDeletedOnPass2: true
        };
      } finally {
        await deleteSessionVolume(orphanClaimName).catch(() => undefined);
        await redisCacheAdapter.delete(markerKey).catch(() => undefined);
      }
    } else if (input.operation === 'seed-preview-session-limit') {
      const sandboxId = getRunningSandboxId({
        sourceType: input.sourceType ?? 'app',
        sourceId: input.appId,
        userId: input.userId
      });
      const indexKey = asRedisLogicalKey(`sandbox:preview:${sandboxId}:active`);
      const count = Number(input.count ?? 500);
      const expireScore = Date.now() + 3600_000;
      await redisCacheAdapter.evalScript({
        script: `
          for i = 1, tonumber(ARGV[1]) do
            redis.call("zadd", KEYS[1], tonumber(ARGV[2]), "fgtest-seed-" .. i)
          end
          redis.call("expire", KEYS[1], 120)
          return redis.call("zcard", KEYS[1])
        `,
        keys: [indexKey],
        args: [count, expireScore]
      });
      result = { sandboxId, seededCount: count };
    } else if (input.operation === 'clear-preview-session-limit') {
      const sandboxId = getRunningSandboxId({
        sourceType: input.sourceType ?? 'app',
        sourceId: input.appId,
        userId: input.userId
      });
      const indexKey = asRedisLogicalKey(`sandbox:preview:${sandboxId}:active`);
      await redisCacheAdapter.delete(indexKey).catch(() => undefined);
      result = { sandboxId, cleared: true };
    } else if (input.operation === 'cascade-delete-source') {
      const { sourceType, sourceId } = input;
      await deleteSandboxResourcesBySource({ sourceType, sourceId });
      const remaining = await MongoSandboxInstance.countDocuments({ sourceType, sourceId });
      result = { sourceType, sourceId, remaining };
    } else if (input.operation === 'create-skill-fixture') {
      const JSZip = req('jszip');
      const { importSkill } = load('packages/service/core/ai/skill/manage/import.ts');
      const { MongoAgentSkillsVersion } = load('packages/service/core/ai/skill/version/schema.ts');
      const zip = new JSZip();
      zip.file(
        'SKILL.md',
        `---\nname: ${input.skillName}\ndescription: FG-TEST skill fixture\n---\n# ${input.skillName}\n`
      );
      zip.file('src/helper.py', 'print("hello from skill")\n');
      zip.file('src/utils/math.py', 'def add(a, b):\n    return a + b\n');
      zip.file('docs/guide.md', '# Skill Usage Guide\n');
      zip.file('entrypoint.sh', '#!/bin/bash\necho "ep-ran" >> skill-entrypoint.log\n');
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      const skillId = await importSkill({
        skill: {
          name: input.skillName,
          description: 'FG-TEST skill fixture',
          category: []
        },
        teamId: input.teamId,
        tmbId: input.tmbId,
        packageStream: Readable.from(buf),
        contentLength: buf.length
      });
      const version = await MongoAgentSkillsVersion.findOne({ skillId }).lean();
      result = {
        skillId: String(skillId),
        versionId: String(version?._id),
        storageKey: version?.storageKey
      };
    } else if (input.operation === 'cleanup-skill-fixture') {
      const { MongoAgentSkills } = load('packages/service/core/ai/skill/model/schema.ts');
      const { MongoAgentSkillsVersion } = load('packages/service/core/ai/skill/version/schema.ts');
      const { deleteSkillPackage } = load('packages/service/core/ai/skill/package/index.ts');
      const versions = await MongoAgentSkillsVersion.find({ skillId: input.skillId }).lean();
      await deleteSkillEditSandboxes([input.skillId]);
      for (const v of versions) {
        if (v.storageKey) await deleteSkillPackage(v.storageKey).catch(() => undefined);
      }
      await MongoAgentSkillsVersion.deleteMany({ skillId: input.skillId });
      await MongoAgentSkills.deleteOne({ _id: input.skillId });
      const remainingSandbox = await MongoSandboxInstance.countDocuments({
        sourceType: 'skillEdit',
        sourceId: input.skillId
      });
      result = { skillId: input.skillId, remainingSandbox };
    } else if (input.operation === 'package-and-publish-skill-version') {
      const JSZip = req('jszip');
      const { packageSkillEditWorkspace } = load(
        'packages/service/core/ai/sandbox/application/skillEdit/runtime.ts'
      );
      const { uploadSkillPackage, removeSkillPackageTTL } = load(
        'packages/service/core/ai/skill/package/index.ts'
      );
      const { MongoAgentSkills } = load('packages/service/core/ai/skill/model/schema.ts');
      const { MongoAgentSkillsVersion } = load('packages/service/core/ai/skill/version/schema.ts');

      const zipBuffer = await packageSkillEditWorkspace({
        skillId: input.skillId,
        teamId: input.teamId,
        validationMode: input.validationMode ?? 'basicZip'
      });
      const parsedZip = await JSZip.loadAsync(zipBuffer);
      const filesInZip = Object.keys(parsedZip.files).filter((k) => !parsedZip.files[k].dir);

      let newVersionId;
      if (input.publishNewVersion) {
        const versionObjectId = new mongo.Types.ObjectId();
        const uploaded = await uploadSkillPackage({
          teamId: input.teamId,
          skillId: input.skillId,
          packageObjectId: String(versionObjectId),
          zipBuffer
        });
        await removeSkillPackageTTL(uploaded.key).catch(() => undefined);
        await MongoAgentSkillsVersion.create({
          _id: versionObjectId,
          skillId: new mongo.Types.ObjectId(input.skillId),
          tmbId: new mongo.Types.ObjectId(input.tmbId),
          version: 1,
          versionName: 'v1-published',
          storageKey: uploaded.key,
          isActive: true,
          createdAt: new Date()
        });
        await MongoAgentSkills.updateOne(
          { _id: input.skillId },
          { $set: { currentVersionId: versionObjectId } }
        );
        newVersionId = String(versionObjectId);
      }
      result = {
        zipBytes: zipBuffer.length,
        filesInZip,
        newVersionId
      };
    } else if (input.operation === 'deploy-skill-to-app-sandbox') {
      const { MongoAgentSkills } = load('packages/service/core/ai/skill/model/schema.ts');
      const { injectAgentSkillFilesToSandbox, getAgentSkillInfos } = load(
        'packages/service/core/ai/sandbox/application/runtime/skill/core.ts'
      );
      const { runAgentSkillVersionEntrypoints } = load(
        'packages/service/core/ai/sandbox/application/runtime/skill/entrypoint.ts'
      );
      const skillDoc = await MongoAgentSkills.findById(input.skillId).lean();
      assert.ok(skillDoc, 'Skill 必须存在');
      const sandboxId = getRunningSandboxId({
        sourceType: 'app',
        sourceId: input.appId,
        userId: input.userId
      });
      const client = await getSandboxClient({
        sandboxId,
        sourceType: 'app',
        sourceId: input.appId,
        userId: input.userId,
        chatId: input.chatId
      });
      try {
        const workspaceRoot = client.getRuntimePaths().workspaceRoot;
        const deployed = await injectAgentSkillFilesToSandbox({
          sandbox: client.opensandbox,
          skills: [skillDoc],
          workDirectory: workspaceRoot
        });
        await runAgentSkillVersionEntrypoints({
          sandbox: client.opensandbox,
          versions: deployed
        });
        await runAgentSkillVersionEntrypoints({
          sandbox: client.opensandbox,
          versions: deployed
        });
        const epCountRes = await client.opensandbox.execute(
          `wc -l < ${deployed[0].targetDir}/skill-entrypoint.log`
        );
        const infos = await getAgentSkillInfos({
          sandbox: client.opensandbox,
          skillDirectories: [deployed[0].targetDir],
          deployedSkillVersions: deployed
        });
        const projectDirs = await client.opensandbox.listDirectory(`${workspaceRoot}/projects`);
        result = {
          sandboxId,
          deployed,
          entrypointRunCount: Number(epCountRes.stdout.trim()),
          infos,
          projectDirs: projectDirs.map((d) => d.name)
        };
      } finally {
        await client.opensandbox.close().catch(() => undefined);
      }
    } else {
      throw new Error(`Unsupported sandbox-service operation: ${input.operation}`);
    }

    process.stdout.write('\nFG_SANDBOX_RESULT=' + JSON.stringify(result) + '\n');
    process.exitCode = 0;
  } catch (error) {
    process.stdout.write(
      '\nFG_SANDBOX_ERROR=' + JSON.stringify({ name: error.name, message: error.message }) + '\n'
    );
    process.exitCode = 1;
  } finally {
    await mongo?.connectionMongo.disconnect().catch(() => undefined);
    await mongo?.connectionLogMongo.disconnect().catch(() => undefined);
    await unregisterEsm?.();
    process.exit(process.exitCode ?? 1);
  }
}
