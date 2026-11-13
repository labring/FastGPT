import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runNodeCase } from '../../support/runtime.mjs';
import { appKeyWorld, roles } from '../../support/app-key.mjs';
import { success, permissionDenied } from '../../support/scenario.mjs';
import {
  enableSandboxForApp,
  invokeSandboxService,
  uploadSandboxBytes
} from '../../support/sandbox-service.mjs';

const req = createRequire(new URL('../../../../projects/app/package.json', import.meta.url));
const JSZip = req('jszip');
const SKILL_CHAT_ID = 'edit-debug';

/**
 * 验证 Skill 工作区 .gitignore 过滤打包、只读协作者导出与发布部署至 App 会话沙箱。
 */
async function execute(context) {
  const w = await appKeyWorld(context);
  const { c, W } = w;
  await enableSandboxForApp(w, context, W);

  const skillName = `fg-skill-mgmt-${c.run}-${context.itemId}`.slice(0, 48);
  const created = await invokeSandboxService(context, c, 'create-skill-fixture', {
    skillName,
    tmbId: c.actor('owner').tmbId
  });
  const skillId = created.skillId;
  context.itemFinalizers.push(() =>
    invokeSandboxService(context, c, 'cleanup-skill-fixture', { skillId })
  );

  await c.request({
    role: 'owner',
    kind: 'state',
    route: '/api/core/ai/skill/runtime/init',
    body: { skillId }
  });

  if (context.itemId === 'C1') {
    // 在 Skill Edit 沙箱写入新源码与应被忽略的目录/文件
    success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/sandbox/fs/exec',
        body: {
          skillId,
          chatId: SKILL_CHAT_ID,
          command:
            'mkdir -p src node_modules/fake .venv && printf "print(123)\\n" > src/new_tool.py && printf "ignored" > node_modules/fake/index.js && printf "ignored" > .venv/pyvenv.cfg && printf "ignored" > package.zip'
        }
      })
    );

    const exportRes = await c.request({
      role: 'owner',
      kind: 'state',
      method: 'GET',
      route: `/api/core/ai/skill/export?skillId=${skillId}`,
      raw: true
    });
    assert.equal(exportRes.status, 200);
    assert.match(exportRes.headers.get('content-type') ?? '', /application\/zip/);

    const zipBuf = Buffer.from(await exportRes.arrayBuffer());
    const zip = await JSZip.loadAsync(zipBuf);
    const files = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

    assert.ok(files.includes('SKILL.md'), '导出包必须包含 SKILL.md');
    assert.ok(files.includes('src/new_tool.py'), '导出包必须包含新增业务文件 src/new_tool.py');
    assert.ok(!files.some((f) => f.startsWith('node_modules/')), '导出包必须排除 node_modules');
    assert.ok(!files.some((f) => f.startsWith('.venv/')), '导出包必须排除 .venv');
    assert.ok(!files.includes('package.zip'), '导出包必须排除 package.zip');

    c.record('C1 Skill 导出包过滤校验', {
      zipBytes: zipBuf.byteLength,
      files
    });
    return 'GET /api/core/ai/skill/export 成功打包工作区并按 .gitignore 排除 node_modules、.venv 与 package.zip';
  }

  if (context.itemId === 'C2') {
    // 1) 授予成员 B 只读权限 (ReadPermissionVal)，验证允许导出
    await w.acl('B', skillId, roles.read, 'agentSkill');
    const bExport = await c.request({
      role: 'B',
      kind: 'state',
      method: 'GET',
      route: `/api/core/ai/skill/export?skillId=${skillId}`,
      raw: true
    });
    assert.equal(bExport.status, 200, '只读协作者 B 应允许调用 export 导出 Skill 包');
    const bZip = await JSZip.loadAsync(Buffer.from(await bExport.arrayBuffer()));
    assert.ok(bZip.file('SKILL.md'));

    // 2) 无权限成员 N 调用 export 应被 unAuthSkill 拒绝
    await w.acl('N', skillId, roles.none, 'agentSkill');
    const nExport = await c.request({
      role: 'N',
      kind: 'state',
      method: 'GET',
      route: `/api/core/ai/skill/export?skillId=${skillId}`
    });
    assert.equal(nExport.error, true, '无权限成员调用 skill/export 应被拒绝');
    assert.equal(nExport.json?.statusText, 'unAuthSkill');

    c.record('C2 只读协作者导出与无权限拒绝', {
      collaboratorExportStatus: bExport.status
    });
    return '具备 ReadPermissionVal 的只读协作者可正常导出 Skill ZIP 包，无权限成员被拒绝';
  }

  if (context.itemId === 'C3') {
    success(
      await uploadSandboxBytes(c, {
        role: 'owner',
        kind: 'state',
        query: {
          skillId,
          chatId: SKILL_CHAT_ID,
          path: `skills/${skillName}/SKILL.md`
        },
        content: `---\nname: ${skillName}\ndescription: Deployed skill package\n---\n# ${skillName}\n`
      })
    );
    success(
      await uploadSandboxBytes(c, {
        role: 'owner',
        kind: 'state',
        query: {
          skillId,
          chatId: SKILL_CHAT_ID,
          path: 'src/deployed_feature.py'
        },
        content: 'FEATURE = "v1-published"\n'
      })
    );

    // 1) 调用真实 HTTP 接口 POST /api/core/ai/skill/save-deploy 保存并发布新版本
    const saveDeployRes = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/skill/save-deploy',
        body: {
          skillId,
          versionName: 'v1-http-save-deploy'
        }
      })
    );
    assert.ok(saveDeployRes.versionId, 'save-deploy 应返回新发布的 versionId');

    // 2) 调用 POST /api/core/ai/skill/version/list 查询历史版本列表并验证切换版本
    const versionListRes = success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/skill/version/list',
        body: {
          skillId,
          offset: 0,
          pageSize: 20
        }
      })
    );
    assert.ok(
      versionListRes.list.some((v) => v._id === saveDeployRes.versionId && v.isCurrent === true),
      'version/list 应包含刚发布并激活的新版本'
    );

    const published = await invokeSandboxService(context, c, 'package-and-publish-skill-version', {
      skillId,
      tmbId: c.actor('owner').tmbId,
      publishNewVersion: true,
      validationMode: 'basicZip'
    });
    assert.ok(published.newVersionId);
    assert.ok(published.filesInZip.includes('src/deployed_feature.py'));

    // 3) 验证 POST /api/core/ai/skill/version/switch 可在两个版本间正常切换
    success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/skill/version/switch',
        body: {
          skillId,
          versionId: saveDeployRes.versionId
        }
      })
    );
    success(
      await c.request({
        role: 'owner',
        kind: 'state',
        route: '/api/core/ai/skill/version/switch',
        body: {
          skillId,
          versionId: published.newVersionId
        }
      })
    );

    const deployRes = await invokeSandboxService(context, c, 'deploy-skill-to-app-sandbox', {
      skillId,
      appId: W,
      userId: c.actor('owner').tmbId,
      chatId: 'skill-deploy-chat-' + Date.now()
    });
    assert.equal(deployRes.deployed.length, 1);
    assert.equal(deployRes.deployed[0].versionId, published.newVersionId);
    assert.equal(deployRes.entrypointRunCount, 1, '重复执行 entrypoint 时只应实际运行 1 次');
    assert.ok(deployRes.infos.length >= 1);
    assert.equal(deployRes.infos[0].appId, skillId);

    c.record('C3 Skill 新版本发布与 App 沙箱部署', {
      httpSaveDeployVersionId: saveDeployRes.versionId,
      newVersionId: published.newVersionId,
      deployedTargetDir: deployRes.deployed[0].targetDir,
      entrypointRunCount: deployRes.entrypointRunCount,
      skillInfo: deployRes.infos[0]
    });
    return 'save-deploy、version/list、version/switch 全链路正常，Skill 新版本成功打包发布并部署至 App 沙箱 /workspace/projects/<versionId>，entrypoint.sh 幂等执行 1 次';
  }
}

await runNodeCase(
  'FG-SKILL-MANAGEMENT-001',
  Object.fromEntries(['C1', 'C2', 'C3'].map((id) => [id, execute]))
);
