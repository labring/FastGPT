import handler from '@/pages/api/core/app/list';
import { onCreateApp } from '@/pages/api/core/app/create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  ReadPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type {
  ListAppBodyType,
  ListAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getFakeUsers, getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

const startNode = {
  nodeId: 'start-1',
  flowNodeType: FlowNodeTypeEnum.workflowStart,
  name: 'Start',
  inputs: [],
  outputs: []
};

const formInputNode = {
  nodeId: 'form-1',
  flowNodeType: FlowNodeTypeEnum.formInput,
  name: 'Form',
  inputs: [],
  outputs: []
};

describe('POST /api/core/app/list', () => {
  it('reads hasInteractiveNode from published version nodes', async () => {
    const owner = await getUser(`app-list-interactive-${getNanoid(6)}`);
    const interactiveAppId = await onCreateApp({
      name: 'interactive app',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [startNode, formInputNode]
    });
    const leftoverModulesAppId = await onCreateApp({
      name: 'leftover modules app',
      intro: '',
      type: AppTypeEnum.workflow,
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      nodes: [startNode]
    });
    await MongoApp.collection.updateOne(
      { _id: new Types.ObjectId(leftoverModulesAppId) },
      { $set: { modules: [formInputNode] } }
    );

    const res = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(handler, {
      auth: owner,
      body: {}
    });
    const findApp = (appId: string) => res.data.find((item) => String(item._id) === appId);

    expect(res.code).toBe(200);
    expect(findApp(interactiveAppId)?.hasInteractiveNode).toBe(true);
    expect(findApp(leftoverModulesAppId)?.hasInteractiveNode).toBe(false);
    expect(res.data.every((app) => !('modules' in app))).toBe(true);
  });

  it('returns only apps covered by the current member resource permission group', async () => {
    const { owner, members } = await getFakeUsers(2);
    const [permittedApp, inaccessibleApp] = await MongoApp.create([
      {
        name: 'Permitted app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      },
      {
        name: 'Inaccessible app',
        type: AppTypeEnum.workflow,
        teamId: owner.teamId,
        tmbId: owner.tmbId
      }
    ]);
    await MongoResourcePermission.create([
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId: permittedApp._id,
        tmbId: members[0].tmbId,
        permission: ReadPermissionVal
      },
      {
        resourceType: PerResourceTypeEnum.app,
        teamId: owner.teamId,
        resourceId: inaccessibleApp._id,
        tmbId: members[1].tmbId,
        permission: ReadPermissionVal
      }
    ]);

    const response = await Call<ListAppBodyType, Record<string, never>, ListAppResponseType>(
      handler,
      {
        auth: members[0],
        body: { type: AppTypeEnum.workflow }
      }
    );

    expect(response.code).toBe(200);
    expect(response.data.map((app) => app.name)).toEqual(['Permitted app']);
    expect(response.data[0]?.permission.hasReadPer).toBe(true);
  });
});
