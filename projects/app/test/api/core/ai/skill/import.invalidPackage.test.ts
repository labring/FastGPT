import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import handler from '@/pages/api/core/ai/skill/import';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { JSZip } from '@fastgpt/service/core/ai/skill/package';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { multer } from '@fastgpt/service/common/file/multer';

vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveFormData: vi.fn(),
    clearDiskTempFiles: vi.fn()
  }
}));

describe('skill/import invalid package', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fastgpt-skill-import-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('缺少 SKILL.md 的压缩包不能创建 skill', async () => {
    const user = await getUser(`skill-import-invalid-${getNanoid(6)}`);
    const zip = new JSZip();
    zip.file('README.md', '# no skill entry');
    const archivePath = path.join(tmpDir, 'no-skill-md.zip');
    await fs.writeFile(archivePath, await zip.generateAsync({ type: 'nodebuffer' }));

    vi.mocked(multer.resolveFormData).mockResolvedValue({
      data: {},
      fileMetadata: {
        path: archivePath,
        originalname: 'no-skill-md.zip'
      }
    } as Awaited<ReturnType<typeof multer.resolveFormData>>);

    const res = await Call(handler, {
      auth: user
    });

    expect(res.code).not.toBe(200);
    expect(res.error).toBe(SkillErrEnum.invalidSkillPackage);
    await expect(MongoAgentSkills.findOne({ teamId: user.teamId }).lean()).resolves.toBeNull();
    await expect(MongoAgentSkillsVersion.countDocuments({ tmbId: user.tmbId })).resolves.toBe(0);
  });
});
