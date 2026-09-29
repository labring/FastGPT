import { Call } from '@test/utils/request';
import { getUser } from '@test/datas/users';
import { describe, expect, it } from 'vitest';
import listApi from '@/pages/api/core/ai/model/config';
import detailApi from '@/pages/api/core/ai/model/detail';
import createApi from '@/pages/api/core/ai/model/create';
import templatesApi from '@/pages/api/core/ai/model/templates';
import createFromTemplatesApi from '@/pages/api/core/ai/model/createFromTemplates';
import deleteApi from '@/pages/api/core/ai/model/delete';
import testApi from '@/pages/api/core/ai/model/test';
import updateApi from '@/pages/api/core/ai/model/update';
import updateStatusApi from '@/pages/api/core/ai/model/updateStatus';
import getConfigJsonApi from '@/pages/api/core/ai/model/getConfigJson';
import updateWithJsonApi from '@/pages/api/core/ai/model/updateWithJson';
import updateDefaultApi from '@/pages/api/core/ai/model/updateDefault';

describe('model management API authorization', () => {
  const adminListApi = (req: any, res: any) => {
    req.query = { ...req.query, channelType: 'system' };
    return listApi(req, res);
  };

  const adminModelApis = [
    ['list', adminListApi],
    ['detail', detailApi],
    ['create', createApi],
    ['templates', templatesApi],
    ['createFromTemplates', createFromTemplatesApi],
    ['delete', deleteApi],
    ['test', testApi],
    ['update', updateApi],
    ['updateStatus', updateStatusApi],
    ['getConfigJson', getConfigJsonApi],
    ['updateWithJson', updateWithJsonApi],
    ['updateDefault', updateDefaultApi]
  ] as const;

  it.each(adminModelApis)(
    'rejects an unauthenticated %s request before handling model data',
    async (_name, api) => {
      const response = await Call(api);

      expect(response.code).not.toBe(200);
      expect(response.error).toBeDefined();
    }
  );

  it('rejects every administrator model endpoint for an authenticated non-root user', async () => {
    const user = await getUser('non-root-admin-model-api');

    const responses = await Promise.all(adminModelApis.map(([, api]) => Call(api, { auth: user })));

    for (const response of responses) {
      expect(response.code).not.toBe(200);
      expect(response.error).toBeDefined();
    }
  });
});
