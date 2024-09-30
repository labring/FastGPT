import '@/pages/api/__mocks__/base';
import { root } from '@/pages/api/__mocks__/db/init';
import { getTestRequest } from '@/test/utils';
import handler from './publish';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { PostPublishAppProps } from '@/global/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

describe('发布应用版本测试', () => {
  test('发布一个未发布的版本', async () => {
    const publishData: PostPublishAppProps = {
      nodes: [],
      edges: [],
      chatConfig: {},
      type: AppTypeEnum.simple,
      isPublish: false,
      versionName: '1'
    };

    await handler(
      ...getTestRequest<{ appId: string }, PostPublishAppProps>({
        body: publishData,
        query: { appId: root.appId },
        user: root
      })
    );

    // 检查数据库是否插入成功
    const insertedVersion = await MongoAppVersion.countDocuments();

    console.log(insertedVersion, '==-');

    // expect(insertedVersion).toBeTruthy();
    // expect(insertedVersion?.isPublish).toBe(false);
    // expect(insertedVersion?.versionName).toBe('1');
  });
});
