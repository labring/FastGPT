import { describe, expect, it } from 'vitest';
import { Types } from '../../../common/mongo';
import { MongoApp } from '../../../core/app/schema';
import {
  extractCurrentAppResourceRefsFromNodes,
  findAppsByCurrentResourceRefs
} from '../../../core/app/currentResourceRefs';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

describe('current App resource references', () => {
  it('extracts dataset, tool and skill ids from the latest workflow nodes', () => {
    const datasetId = new Types.ObjectId().toString();
    const agentDatasetId = new Types.ObjectId().toString();
    const toolId = new Types.ObjectId().toString();
    const toolSetId = new Types.ObjectId().toString();
    const skillId = new Types.ObjectId().toString();

    const refs = extractCurrentAppResourceRefsFromNodes([
      {
        pluginId: `personal-${toolId}`,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSelectList,
            value: [{ datasetId }]
          },
          {
            key: NodeInputKeyEnum.datasetParams,
            value: { datasets: [{ datasetId: agentDatasetId }] }
          },
          {
            key: NodeInputKeyEnum.skills,
            value: [{ skillId }, { skillId }]
          },
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [{ id: `mcp-${toolSetId}/search` }]
          },
          {
            key: NodeInputKeyEnum.datasetSelectList,
            selectedType: FlowNodeInputTypeEnum.reference,
            value: ['node-id', 'output-key']
          }
        ]
      } as StoreNodeItemType
    ]);

    expect(refs).toEqual({
      datasetIds: [datasetId, agentDatasetId],
      toolIds: [toolId, toolSetId],
      skillIds: [skillId]
    });
  });

  it('finds draft references and ignores deleted Apps', async () => {
    const teamId = new Types.ObjectId();
    const tmbId = new Types.ObjectId();
    const datasetId = new Types.ObjectId().toString();
    const toolId = new Types.ObjectId().toString();
    const skillId = new Types.ObjectId().toString();

    const [activeApp] = await MongoApp.create([
      {
        name: 'Draft references',
        type: AppTypeEnum.chatAgent,
        teamId,
        tmbId,
        resourceRefs: { skillIds: [] },
        modules: [
          {
            inputs: [
              {
                key: NodeInputKeyEnum.datasetParams,
                value: { datasets: [{ datasetId }] }
              },
              {
                key: NodeInputKeyEnum.selectedTools,
                value: [{ id: `personal-${toolId}` }]
              },
              {
                key: NodeInputKeyEnum.skills,
                value: [{ skillId }]
              }
            ]
          }
        ]
      },
      {
        name: 'Deleted draft references',
        type: AppTypeEnum.chatAgent,
        teamId,
        tmbId,
        deleteTime: new Date(),
        modules: [
          {
            inputs: [
              {
                key: NodeInputKeyEnum.skills,
                value: [{ skillId }]
              }
            ]
          }
        ]
      }
    ]);

    const [datasetApps, toolApps, skillApps] = await Promise.all([
      findAppsByCurrentResourceRefs({
        teamId: String(teamId),
        resourceType: 'dataset',
        resourceIds: [datasetId]
      }),
      findAppsByCurrentResourceRefs({
        teamId: String(teamId),
        resourceType: 'tool',
        resourceIds: [toolId]
      }),
      findAppsByCurrentResourceRefs({
        teamId: String(teamId),
        resourceType: 'skill',
        resourceIds: [skillId]
      })
    ]);

    expect(datasetApps.map((app) => String(app._id))).toEqual([String(activeApp._id)]);
    expect(toolApps.map((app) => String(app._id))).toEqual([String(activeApp._id)]);
    expect(skillApps.map((app) => String(app._id))).toEqual([String(activeApp._id)]);
  });
});
