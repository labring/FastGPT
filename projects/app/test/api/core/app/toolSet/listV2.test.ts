import handler from '@/pages/api/core/app/toolSet/listV2';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type {
  ListToolSetV2BodyType,
  ListToolSetV2ResponseType
} from '@fastgpt/global/openapi/core/app/toolSet/api';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it } from 'vitest';

describe('POST /api/core/app/toolSet/listV2', () => {
  it('filters and paginates HTTP toolset children after authentication', async () => {
    const user = await getUser(`toolset-list-v2-${getNanoid(6)}`);
    const app = await MongoApp.create({
      name: 'HTTP toolset',
      type: AppTypeEnum.httpToolSet,
      teamId: user.teamId,
      tmbId: user.tmbId,
      modules: [
        {
          toolConfig: {
            httpToolSet: {
              toolList: [
                { name: 'create-ticket', description: 'Create a ticket' },
                { name: 'search-ticket', description: 'Search tickets' },
                { name: 'delete-ticket', description: 'Delete a ticket' }
              ]
            }
          }
        }
      ]
    });

    const response = await Call<
      ListToolSetV2BodyType,
      Record<string, never>,
      ListToolSetV2ResponseType
    >(handler, {
      auth: user,
      body: {
        parentId: String(app._id),
        searchKey: 'ticket',
        offset: 1,
        pageSize: 1
      }
    });

    expect(response.code).toBe(200);
    expect(response.data.total).toBe(3);
    expect(response.data.list).toHaveLength(1);
    expect(response.data.list[0]).toMatchObject({
      name: 'search-ticket',
      id: `http-${app._id}/search-ticket`,
      flowNodeType: 'tool',
      isFolder: false
    });
  });
});
