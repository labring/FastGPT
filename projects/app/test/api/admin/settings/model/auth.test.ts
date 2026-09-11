import { Call } from '@test/utils/request';
import { getUser } from '@test/datas/users';
import { describe, expect, it } from 'vitest';
import listApi from '@/pages/api/admin/settings/model/list';
import detailApi from '@/pages/api/admin/settings/model/detail';
import createApi from '@/pages/api/admin/settings/model/create';
import templatesApi from '@/pages/api/admin/settings/model/templates';
import createFromTemplatesApi from '@/pages/api/admin/settings/model/createFromTemplates';
import replaceChannelsApi from '@/pages/api/admin/settings/model/channel/replace';
import deleteApi from '@/pages/api/admin/settings/model/delete';
import testApi from '@/pages/api/admin/settings/model/test';
import updateApi from '@/pages/api/admin/settings/model/update';
import updateStatusApi from '@/pages/api/admin/settings/model/updateStatus';
import getConfigJsonApi from '@/pages/api/admin/settings/model/getConfigJson';
import updateWithJsonApi from '@/pages/api/admin/settings/model/updateWithJson';
import updateDefaultApi from '@/pages/api/admin/settings/model/updateDefault';

describe('admin model API authorization', () => {
  const adminModelApis = [
    ['list', listApi],
    ['detail', detailApi],
    ['create', createApi],
    ['templates', templatesApi],
    ['createFromTemplates', createFromTemplatesApi],
    ['channel/replace', replaceChannelsApi],
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
