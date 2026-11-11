import assert from 'node:assert/strict';
import { runNodeCase } from '../../support/runtime.mjs';
import { workflowScenario } from '../../app/workflow/execution/workflow-api.mjs';
import { workflowService } from '../../app/workflow/execution/workflow-service.mjs';

await runNodeCase('FG-PERMISSION-RESOURCE-004', {
  async C2(context) {
    const c = await workflowScenario(context);
    const s = await workflowService(context, c);
    const { MongoAIModel } = s.load('packages/service/core/ai/model/schema.ts');
    const { MongoDataset } = s.load('packages/service/core/dataset/schema.ts');
    const { resourcePermissionRepo } = s.load(
      'packages/service/support/permission/repository/resourcePermissionRepo.ts'
    );
    const { clearMemberModelsCache } = s.load('packages/service/support/permission/model/cache.ts');
    const { getTeamModelHandle } = s.load('packages/service/core/ai/model/catalog/service.ts');
    const { getAuthorizedModelIds } = s.load('packages/service/support/permission/model/auth.ts');
    const { createWorkflowResourceContext } = s.load(
      'packages/service/core/workflow/dispatch/context/resource.ts'
    );
    const { loadWorkflowModelResource, loadWorkflowDatasetResource } = s.load(
      'packages/service/core/workflow/resource/service.ts'
    );
    const teamId = c.fixture.teamId;
    const actor = { teamId, tmbId: c.fixture.actors.A.tmbId, isRoot: false };
    const ownerTmbId = c.fixture.actors.owner.tmbId;
    const owned = { models: [], datasets: [] };

    // 先登记精确清理；只删除本轮新资源及其 ACL，不修改共享系统模型或其他团队缓存。
    context.itemFinalizers.push(async () => {
      const counts = [];
      for (const [resourceType, ids, collection] of [
        ['model', owned.models, 'ai_models'],
        ['dataset', owned.datasets, 'datasets']
      ]) {
        if (!ids.length) continue;
        await resourcePermissionRepo.deleteByResources({ teamId, resourceType, resourceIds: ids });
        const query = {
          teamId: new c.ObjectId(teamId),
          _id: { $in: ids.map((id) => new c.ObjectId(id)) }
        };
        await c.db.collection(collection).deleteMany(query);
        const remaining = await c.db.collection(collection).countDocuments(query);
        const acl = await resourcePermissionRepo.findByResourceIds({
          teamId,
          resourceType,
          resourceIds: ids
        });
        counts.push({ collection, ids, remaining, aclRemaining: acl.length });
        assert.equal(remaining, 0);
        assert.equal(acl.length, 0);
      }
      await clearMemberModelsCache({ teamId });
      c.record('动态资源精确清理', counts);
    });

    // 使用真实 Schema 和目录创建团队资源。此场景验证 loader 的 ACL，不调用模型或写入向量。
    const base = await c.db.collection('ai_models').findOne({
      model: 'deepseek-v4.1-flash',
      scope: 'system',
      isActive: true
    });
    assert.ok(base);
    const model = await MongoAIModel.create({
      model: c.run,
      name: 'FG-TEST-dynamic-' + c.run,
      type: 'llm',
      provider: base.provider,
      config: base.config,
      scope: 'team',
      teamId,
      tmbId: ownerTmbId,
      isActive: true
    });
    owned.models.push(String(model._id));
    for (const name of ['D1', 'D2']) {
      const dataset = await MongoDataset.create({
        teamId,
        tmbId: ownerTmbId,
        type: 'dataset',
        name: 'FG-TEST-' + name + '-' + c.run
      });
      owned.datasets.push(String(dataset._id));
    }
    const [d1, d2] = owned.datasets;
    const modelId = owned.models[0];
    const handle = await getTeamModelHandle({ teamId });
    const graph = await c.load('empty-input');

    /** ACL 变更后显式清除本轮团队的真实成员缓存，并核实目录可用集合。 */
    async function grant({ allowed }) {
      for (const [resourceType, resourceId] of [
        ['model', modelId],
        ['dataset', d2]
      ]) {
        await resourcePermissionRepo.updateCollaborator({
          teamId,
          resourceType,
          resourceId,
          collaborator: { tmbId: actor.tmbId },
          permission: allowed ? 1 : 0
        });
      }
      await clearMemberModelsCache({ teamId });
      const ids = await getAuthorizedModelIds({ actor, handle });
      assert.equal(ids.has(modelId), allowed);
      c.record('运行人真实 ACL 与模型缓存', {
        actor,
        ownerTmbId,
        allowed,
        modelId,
        authorizedModelIds: [...ids],
        modelAcl: await resourcePermissionRepo.findByResource({
          teamId,
          resourceType: 'model',
          resourceId: modelId
        }),
        datasetAcl: await resourcePermissionRepo.findByResource({
          teamId,
          resourceType: 'dataset',
          resourceId: d2
        })
      });
    }

    /** 完整真实 Context 下测试动态引用；D1 快照命中不能授权后续 D2。 */
    async function within(fn) {
      return s.run(
        c.fixture.apps.identity,
        graph,
        c.run + '-dynamic',
        {},
        undefined,
        ({ context: parent }) =>
          s.runWithContext(
            parent.getChildContext({
              resourceContext: createWorkflowResourceContext({
                resources: [{ type: 'dataset', id: d1 }],
                teamId,
                isRoot: false
              })
            }),
            fn
          )
      );
    }

    for (const allowed of [true, false]) {
      await grant({ allowed });
      await within(async () => {
        const requests = [
          [
            'dynamic-model',
            () => loadWorkflowModelResource({ appTeamId: teamId, userInfo: actor, modelId })
          ],
          [
            'dynamic-dataset',
            () => loadWorkflowDatasetResource({ datasetId: d2, tmbId: actor.tmbId })
          ],
          [
            'mixed-datasets',
            () =>
              loadWorkflowDatasetResource({
                datasetId: d1,
                datasetIds: [d1, d2],
                tmbId: actor.tmbId
              })
          ]
        ];
        for (const [label, load] of requests) {
          if (allowed) {
            const loaded = await load();
            const expectedId =
              label === 'dynamic-model' ? modelId : label === 'dynamic-dataset' ? d2 : d1;
            assert.equal(String(loaded.modelId ?? loaded._id), expectedId);
            c.record('动态资源允许', {
              label,
              actor,
              expectedId,
              actualId: String(loaded.modelId ?? loaded._id)
            });
          } else {
            let thrown;
            try {
              await load();
            } catch (error) {
              thrown = error;
            }
            assert.ok(thrown, label + ' 必须拒绝');
            const code = thrown instanceof Error ? thrown.message : String(thrown);
            assert.equal(code, label === 'dynamic-model' ? 'unAuthModel' : 'unAuthDataset');
            c.record('动态资源拒绝', { label, actor, code, returnedProtectedResource: false });
          }
        }
        return {};
      });
    }
    return '真实服务的动态模型、动态知识库及混合列表，均按运行人授权先允许、撤权后拒绝；发布者所有权与 D1 静态快照未穿透 D2。';
  }
});
