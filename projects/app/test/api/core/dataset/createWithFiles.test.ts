import { getModelTestDefaults, setModelTestSnapshot } from '@test/modelCache';
import { describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/dataset/createWithFiles';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import type {
  CreateDatasetWithFilesBody,
  CreateDatasetWithFilesResponse
} from '@fastgpt/global/openapi/core/dataset/api';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import type { parseHeaderCertRet } from '@test/mocks/request';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

/** 授予团队成员创建知识库的团队权限。 */
const grantDatasetCreatePermission = (user: parseHeaderCertRet) =>
  MongoResourcePermission.create({
    resourceType: 'team',
    teamId: user.teamId,
    resourceId: null,
    tmbId: user.tmbId,
    permission: TeamDatasetCreatePermissionVal
  });

/** mock 存储对象的直接写入方法（绕过 uploadObject）。 */
type PutMockObject = (key: string, obj: { body: Buffer } & Record<string, unknown>) => void;

describe('create dataset with files VLM selection', () => {
  it.each([undefined, null, ''])(
    'preserves explicit opt-out instead of restoring the default (%s)',
    async (vlmModelId) => {
      const users = await getFakeUsers(1);
      const owner = users.members[0];
      await grantDatasetCreatePermission(owner);
      const previous = getModelTestDefaults();
      setModelTestSnapshot({
        defaultModels: {
          ...previous,
          datasetImageLLM: { ...previous.llm!, config: { ...previous.llm!.config, vision: true } }
        }
      });
      try {
        const result = await Call<
          CreateDatasetWithFilesBody,
          Record<string, never>,
          CreateDatasetWithFilesResponse
        >(handler, {
          auth: owner,
          body: { datasetParams: { name: 'create-files', avatar: '', vlmModelId }, files: [] }
        });
        expect(result.code).toBe(200);
        const dataset = await MongoDataset.findById(result.data.datasetId).lean();
        expect(dataset?.vlmModelId).toBe(
          vlmModelId === undefined ? previous.llm!.modelId : undefined
        );
      } finally {
        setModelTestSnapshot({ defaultModels: previous });
      }
    }
  );
});

describe('create dataset with files temp key ownership', () => {
  // 漏洞回归：temp key 由客户端传入，团队隔离不能只靠 temp/ 前缀。
  it.each([
    ['a foreign team temp key', 'temp/team-foreign/secret.pdf'],
    ['a dataset key', 'dataset/507f1f77bcf86cd799439011/secret.pdf'],
    ['a chat key', 'chat/app-1/user-1/chat-1/secret.pdf'],
    ['a bare temp prefix', 'temp/'],
    ['a team id that only shares a prefix with the caller team', 'temp/team-a-extra/secret.pdf']
  ])('rejects %s before creating the dataset', async (_, fileId) => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    await grantDatasetCreatePermission(owner);

    const result = await Call<
      CreateDatasetWithFilesBody,
      Record<string, never>,
      CreateDatasetWithFilesResponse
    >(handler, {
      auth: owner,
      body: {
        datasetParams: { name: 'reject-foreign-temp', avatar: '' },
        files: [{ fileId, name: 'secret.pdf' }]
      }
    });

    expect(result.code).toBe(500);
    expect(result.error).toBe(CommonErrEnum.unAuthFileKey);
    await expect(MongoDataset.countDocuments({ teamId: owner.teamId })).resolves.toBe(0);
  });

  it('moves a temp key owned by the caller team into the new dataset', async () => {
    const users = await getFakeUsers(1);
    const owner = users.members[0];
    await grantDatasetCreatePermission(owner);

    const fileId = `temp/${owner.teamId}/allowed.pdf`;
    const storage = (new S3PrivateBucket() as unknown as { client: { __putObject: PutMockObject } })
      .client;
    storage.__putObject(fileId, {
      body: Buffer.from('hello'),
      metadata: { originFilename: encodeURIComponent('allowed.pdf') },
      contentType: 'application/pdf'
    });

    const result = await Call<
      CreateDatasetWithFilesBody,
      Record<string, never>,
      CreateDatasetWithFilesResponse
    >(handler, {
      auth: owner,
      body: {
        datasetParams: { name: 'accept-own-temp', avatar: '' },
        files: [{ fileId, name: 'allowed.pdf' }]
      }
    });

    expect(result.code).toBe(200);
    const dataset = await MongoDataset.findById(result.data.datasetId).lean();
    expect(dataset).toBeTruthy();
  });
});
