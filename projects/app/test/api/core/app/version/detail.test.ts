import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/app/version/detail';
import type {
  GetAppVersionDetailQueryType,
  GetAppVersionDetailResponseType
} from '@fastgpt/global/openapi/core/app/version/api';

describe('app version detail API resources', () => {
  it('extracts resources for a legacy version without a stored snapshot', async () => {
    const root = await getRootUser();
    const app = await MongoApp.create({
      name: 'legacy version detail',
      tmbId: root.tmbId,
      teamId: root.teamId
    });
    const version = await MongoAppVersion.create({
      tmbId: root.tmbId,
      appId: app._id,
      nodes: [],
      edges: [],
      chatConfig: {
        questionGuide: {
          open: true,
          model: 'legacy-guide-model'
        }
      },
      versionName: 'legacy'
    });
    await MongoAppVersion.updateOne({ _id: version._id }, { $unset: { resources: 1 } });

    const res = await Call<
      Record<string, never>,
      GetAppVersionDetailQueryType,
      GetAppVersionDetailResponseType
    >(handler, {
      auth: root,
      headers: {},
      query: {
        appId: String(app._id),
        versionId: String(version._id)
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.resources).toEqual([
      { type: 'model', id: 'legacy-guide-model', data: { modelType: 'llm' } }
    ]);
  });
});
