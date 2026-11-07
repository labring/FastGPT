import handler from '@/pages/api/core/app/detail';
import { onCreateApp } from '@/pages/api/core/app/create';
import publishHandler from '@/pages/api/core/app/version/publish';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  GetAppDetailQueryType,
  GetAppDetailResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { PublishAppBodyType } from '@fastgpt/global/openapi/core/app/version/api';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { getModelTestDefaults } from '@test/modelCache';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('get app detail api', () => {
  it('returns draft workflow as nodes', async () => {
    const [owner] = (await getFakeUsers(1)).members;
    const appId = await onCreateApp({
      name: 'detail nodes app',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [
            {
              key: 'query',
              label: 'Query',
              renderTypeList: [FlowNodeInputTypeEnum.input]
            }
          ],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: { welcomeText: 'hello' }
    });

    const res = await Call<Record<string, never>, GetAppDetailQueryType, GetAppDetailResponseType>(
      handler,
      {
        auth: owner,
        headers: {},
        query: { appId }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.nodes.map((node) => node.nodeId)).toEqual(['start-1']);
    expect(res.data).not.toHaveProperty('modules');
  });

  it.each([
    {
      flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
      inputKey: NodeInputKeyEnum.datasetSelectList
    },
    { flowNodeType: FlowNodeTypeEnum.agent, inputKey: NodeInputKeyEnum.datasetSelectList },
    { flowNodeType: FlowNodeTypeEnum.agent, inputKey: NodeInputKeyEnum.datasetParams }
  ])(
    '保存 $flowNodeType 的 $inputKey 仅存 ID，详情接口实时补全展示信息',
    async ({ flowNodeType, inputKey }) => {
      const owner = await getUser(`detail-dataset-${getNanoid(6)}`);
      const embeddingModel = getModelTestDefaults().embedding;
      const dataset = await MongoDataset.create({
        name: 'Dataset before rename',
        avatar: '/icon/old-dataset.svg',
        vectorModelId: embeddingModel.modelId,
        vectorModel: embeddingModel.model,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      });
      const datasetId = String(dataset._id);
      const appId = await onCreateApp({
        name: 'Dataset detail hydration',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId,
        nodes: []
      });
      const datasets = [
        {
          datasetId,
          name: 'Stale name',
          avatar: '/icon/stale-dataset.svg',
          vectorModel: { modelId: 'stale-model-id', model: 'stale-model' },
          error: 'resource_missing'
        }
      ];
      const isDatasetParams = inputKey === NodeInputKeyEnum.datasetParams;
      const saved = await Call<PublishAppBodyType>(publishHandler, {
        auth: owner,
        query: { appId },
        body: {
          isPublish: false,
          nodes: [
            {
              nodeId: 'dataset-node',
              flowNodeType,
              name: 'Dataset',
              inputs: [
                {
                  key: inputKey,
                  label: 'Datasets',
                  renderTypeList: [
                    isDatasetParams
                      ? FlowNodeInputTypeEnum.selectDatasetParamsModal
                      : FlowNodeInputTypeEnum.selectDataset
                  ],
                  value: isDatasetParams ? { datasets, similarity: 0.5, limit: 5 } : datasets
                }
              ],
              outputs: []
            }
          ]
        }
      });
      expect(saved.code, JSON.stringify(saved)).toBe(200);

      const version = await MongoAppVersion.findOne({ appId }).sort({ time: -1, _id: -1 }).lean();
      expect(version?.nodes[0].inputs.find((input) => input.key === inputKey)?.value).toEqual(
        isDatasetParams ? { datasets: [{ datasetId }], similarity: 0.5, limit: 5 } : [{ datasetId }]
      );

      await MongoDataset.updateOne(
        { _id: dataset._id },
        { $set: { name: 'Current dataset name', avatar: '/icon/current-dataset.svg' } }
      );
      const detail = await Call<
        Record<string, never>,
        GetAppDetailQueryType,
        GetAppDetailResponseType
      >(handler, { auth: owner, headers: {}, query: { appId } });
      expect(detail.code, JSON.stringify(detail)).toBe(200);
      const detailValue = detail.data.nodes[0].inputs.find(
        (input) => input.key === inputKey
      )?.value;
      const hydratedDatasets = isDatasetParams
        ? (detailValue as { datasets: unknown[] }).datasets
        : detailValue;
      expect(hydratedDatasets).toEqual([
        {
          datasetId,
          name: 'Current dataset name',
          avatar: '/icon/current-dataset.svg',
          vectorModel: { modelId: embeddingModel.modelId, model: embeddingModel.model }
        }
      ]);
    }
  );

  it('does not expose workflow configuration to a read-only collaborator', async () => {
    const owner = await getUser(`detail-owner-${getNanoid(6)}`);
    const reader = await getUser(`detail-reader-${getNanoid(6)}`, owner.teamId);
    const appId = await onCreateApp({
      name: 'private workflow config',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [
        {
          nodeId: 'start-1',
          flowNodeType: 'workflowStart',
          name: 'Start',
          inputs: [],
          outputs: []
        }
      ],
      edges: [],
      chatConfig: {
        instruction: 'private instruction',
        scheduledTriggerConfig: {
          cronString: '0 9 * * *',
          timezone: 'Asia/Shanghai',
          defaultPrompt: 'private prompt'
        }
      }
    });
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.app,
      teamId: owner.teamId,
      resourceId: appId,
      tmbId: reader.tmbId,
      permission: ReadPermissionVal
    });

    const res = await Call<Record<string, never>, GetAppDetailQueryType, GetAppDetailResponseType>(
      handler,
      {
        auth: reader,
        headers: {},
        query: { appId }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data.nodes).toEqual([]);
    expect(res.data.edges).toEqual([]);
    expect(res.data.chatConfig).toEqual({});
  });
});
