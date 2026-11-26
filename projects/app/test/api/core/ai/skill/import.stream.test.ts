import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import handler from '@/pages/api/core/ai/skill/import';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { downloadSkillPackageStream } from '@fastgpt/service/core/ai/skill/package/storage';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getAgentSandboxDiskBytes } from '@fastgpt/service/core/ai/sandbox/config';
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

const readStoredPackage = async (storageKey: string): Promise<Buffer> => {
  const stream = await downloadSkillPackageStream({ storageKey });
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
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
  it('直接将上传的 .zip 流式写入 S3 并绑定初始版本（剥离 .zip 生成默认名称）', async () => {
    const user = await getUser(`skill-import-zip-${getNanoid(6)}`);
    const zip = new JSZip();
    zip.file('skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo skill\n---\n');
    zip.file('skills/demo/hello.txt', 'hello world');
    const content = await zip.generateAsync({ type: 'nodebuffer' });

    const res = await callImport({
      content,
      filename: 'demo-skill.zip',
      user,
      headers: { 'content-type': 'application/zip' }
    });

    expect(res).toEqual(expect.objectContaining({ code: 200 }));
    const skill = await MongoAgentSkills.findById(res.data).lean();
    expect(skill?.name).toBe('demo-skill');

    const version = await MongoAgentSkillsVersion.findOne({ skillId: skill?._id }).lean();
    expect(version?.storageKey).toMatch(/\.zip$/);

    const storedBuffer = await readStoredPackage(version!.storageKey);
    expect(storedBuffer.equals(content)).toBe(true);
  });

  it('拒绝非 .zip 扩展名（例如 .tar.zst 或 .txt）', async () => {
    const user = await getUser(`skill-import-ext-${getNanoid(6)}`);
    const res = await callImport({
      content: Buffer.from('not-zip-data'),
      filename: 'skill.tar.zst',
      user,
      headers: { 'content-type': 'application/octet-stream' }
    });

    expect(res.error).toBe(SkillErrEnum.invalidArchiveFormat);
    await expect(
      MongoAgentSkills.findOne({ name: 'skill', teamId: user.teamId })
    ).resolves.toBeNull();
  });

  it('允许未传 content-length 时通过分块流上传 .zip', async () => {
    const user = await getUser(`skill-import-chunked-${getNanoid(6)}`);
    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: chunked\n---\n');
    const content = await zip.generateAsync({ type: 'nodebuffer' });

    const req = Object.assign(Readable.from([content.subarray(0, 20), content.subarray(20)]), {
      body: undefined,
      query: { filename: 'chunked-skill.zip' },
      headers: { 'content-type': 'application/zip' },
      auth: user
    });

    const res = (await handler(req as any, { writableFinished: false } as any)) as {
      code: number;
      data?: string;
    };

    expect(res).toEqual(expect.objectContaining({ code: 200 }));
    const skill = await MongoAgentSkills.findById(res.data).lean();
    expect(skill?.name).toBe('chunked-skill');

    const version = await MongoAgentSkillsVersion.findOne({ skillId: skill?._id }).lean();
    expect(version?.storageKey).toMatch(/\.zip$/);
    const storedBuffer = await readStoredPackage(version!.storageKey);
    expect(storedBuffer.equals(content)).toBe(true);
  });

  it('仅按 Content-Length 提前拒绝超出大小限制的文件', async () => {
    const user = await getUser(`skill-import-size-${getNanoid(6)}`);
    const content = Buffer.from('content');

    const res = await callImport({
      content,
      filename: 'package.zip',
      user,
      headers: {
        'content-length': String(getAgentSandboxDiskBytes() + 1),
        'content-type': 'text/plain'
      }
    });

    expect(res.error).toBe(SkillErrEnum.archiveTooLarge);
    await expect(
      MongoAgentSkills.findOne({ name: 'package', teamId: user.teamId })
    ).resolves.toBeNull();
  });
});
