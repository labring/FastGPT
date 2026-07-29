import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import handler from '@/pages/api/core/ai/skill/import';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { downloadSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getAgentSandboxSkillMaxBytes } from '@fastgpt/service/core/ai/sandbox/interface/config';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import type { MockReqType } from '@test/mocks/request';

type ImportRequestParams = {
  content: Buffer;
  filename: string;
  user: NonNullable<MockReqType['auth']>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
};

/** 使用原始 body 调用导入接口，保留 Node Readable 的背压语义。 */
const callImport = async ({
  content,
  filename,
  user,
  query = {},
  headers = {}
}: ImportRequestParams) => {
  const req = Object.assign(Readable.from([content]), {
    body: undefined,
    query: {
      filename,
      ...query
    },
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(content.length),
      ...headers
    },
    auth: user
  });

  return handler(req as any, { writableFinished: false } as any) as Promise<{
    code: number;
    data?: string;
    error?: unknown;
  }>;
};

describe('skill/import stream', () => {
  it('不校验 ZIP 内容和 MIME，并将原始请求流保存为初始版本', async () => {
    const user = await getUser(`skill-import-opaque-${getNanoid(6)}`);
    const content = Buffer.from('opaque-package-content');

    const res = await callImport({
      content,
      filename: 'opaque.zip',
      user,
      headers: { 'content-type': 'text/plain' }
    });

    expect(res).toEqual(expect.objectContaining({ code: 200 }));
    const skill = await MongoAgentSkills.findById(res.data).lean();
    expect(skill?.name).toBe('opaque');

    const version = await MongoAgentSkillsVersion.findOne({ skillId: skill?._id }).lean();
    await expect(downloadSkillPackage({ storageKey: version!.storageKey })).resolves.toEqual(
      content
    );
  });

  it('仅按 Content-Length 提前拒绝超出大小限制的文件', async () => {
    const user = await getUser(`skill-import-size-${getNanoid(6)}`);
    const content = Buffer.from('content');

    const res = await callImport({
      content,
      filename: 'package.zip',
      user,
      headers: {
        'content-length': String(getAgentSandboxSkillMaxBytes() + 1),
        'content-type': 'text/plain'
      }
    });

    expect(res.error).toBe(SkillErrEnum.archiveTooLarge);
    await expect(
      MongoAgentSkills.findOne({ name: 'package', teamId: user.teamId })
    ).resolves.toBeNull();
  });
});
