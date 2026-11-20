import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import JSZip from 'jszip';
import handler from '@/pages/api/core/ai/skill/export';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getRootUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';
import { buffer } from 'node:stream/consumers';
import { createTarZstStream } from '@fastgpt/service/common/file/tarZst';
import { SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR } from '@fastgpt/service/core/ai/sandbox/constants';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const skillExportMocks = vi.hoisted(() => ({
  streamSkillEditWorkspaceTarZstMock: vi.fn()
}));

vi.mock(
  '@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/application/skillEdit/runtime')
      >();
    return {
      ...actual,
      streamSkillEditWorkspaceTarZst: skillExportMocks.streamSkillEditWorkspaceTarZstMock
    };
  }
);

const mockJsonRes = vi.mocked(jsonRes);

function makeMockRes() {
  const headers: Record<string, any> = {};
  const chunks: Buffer[] = [];
  let statusCode = 200;

  const stream = new PassThrough();
  stream.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const res: any = Object.defineProperties(
    Object.assign(stream, {
      setHeader: vi.fn((key: string, value: any) => {
        headers[key] = value;
      }),
      status: vi.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      json: vi.fn()
    }),
    {
      headers: {
        enumerable: true,
        get: () => headers
      },
      bodyBuffer: {
        enumerable: true,
        get: () => Buffer.concat(chunks)
      },
      statusCode: {
        enumerable: true,
        get: () => statusCode
      }
    }
  );
  return res;
}

function makeMockReq(opts: { method?: string; query?: Record<string, any>; auth?: any } = {}) {
  return {
    method: opts.method ?? 'GET',
    query: opts.query ?? {},
    auth: opts.auth
  } as any;
}

describe('GET /api/core/ai/skill/export', () => {
  const createdSkillIds: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (createdSkillIds.length === 0) return;

    await MongoAgentSkills.deleteMany({ _id: { $in: createdSkillIds } });
    createdSkillIds.length = 0;
  });

  const createPersonalSkill = async ({
    user,
    name
  }: {
    user: Awaited<ReturnType<typeof getRootUser>>;
    name: string;
  }) => {
    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name,
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });
    createdSkillIds.push(String(skill._id));

    return skill;
  };

  it('编辑沙盒未运行时应返回 404', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'skill-without-sandbox' });
    const skillId = String(skill._id);

    skillExportMocks.streamSkillEditWorkspaceTarZstMock.mockRejectedValueOnce(
      new Error(SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR)
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(skillExportMocks.streamSkillEditWorkspaceTarZstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId,
        teamId: user.teamId
      })
    );
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR
    });
  });

  it('同 team 用户可流式将 edit sandbox 工作区(.tar.zst)实时转为 .zip 导出', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill' });
    const skillId = String(skill._id);

    const tarZstBuffer = await buffer(
      createTarZstStream([
        { path: 'skills/', type: 'directory', mode: 0o755 },
        { path: 'skills/demo/', type: 'directory', mode: 0o755 },
        {
          path: 'skills/demo/SKILL.md',
          type: 'file',
          mode: 0o644,
          content: Buffer.from('---\nname: demo\n---\n# Demo')
        },
        {
          path: 'skills/demo/empty.txt',
          type: 'file',
          mode: 0o644,
          content: Buffer.alloc(0)
        },
        { path: 'skills/demo/lib', type: 'symlink', mode: 0o777, linkname: '../shared' }
      ])
    );

    skillExportMocks.streamSkillEditWorkspaceTarZstMock.mockImplementationOnce(
      async ({ onStreamReady }) => onStreamReady(Readable.from([tarZstBuffer]))
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(skillExportMocks.streamSkillEditWorkspaceTarZstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId,
        teamId: user.teamId
      })
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining("attachment; filename*=UTF-8''")
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    const exportedZip = await JSZip.loadAsync(res.bodyBuffer);
    expect(await exportedZip.file('skills/demo/SKILL.md')?.async('string')).toBe(
      '---\nname: demo\n---\n# Demo'
    );
    expect((await exportedZip.file('skills/demo/empty.txt')?.async('nodebuffer'))?.length).toBe(0);
    const symlink = exportedZip.file('skills/demo/lib');
    expect(((symlink?.unixPermissions as number) & 0o170000) >>> 0).toBe(0o120000);
    expect(await symlink?.async('string')).toBe('../shared');
    expect(addAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEventEnum.EXPORT_SKILL,
        resources: [
          expect.objectContaining({
            type: 'skill',
            id: skillId,
            name: 'workspace-skill'
          })
        ],
        params: expect.objectContaining({ skillName: 'workspace-skill' })
      })
    );
  });

  it('sandbox team 不匹配时应返回 404', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill-team-mismatch' });
    const skillId = String(skill._id);

    skillExportMocks.streamSkillEditWorkspaceTarZstMock.mockRejectedValueOnce(
      new Error(SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR)
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR
    });
  });

  it('工作区打包失败时应继续抛出原始错误', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-package-error' });
    const packageError = new Error('package failed');

    skillExportMocks.streamSkillEditWorkspaceTarZstMock.mockRejectedValueOnce(packageError);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await expect(handler(req, res)).resolves.toMatchObject({
      code: 500,
      error: packageError
    });
    expect(mockJsonRes).not.toHaveBeenCalled();
  });

  it('工作区打包流缺少 SKILL.md 时应在流解析阶段报错', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-missing-skill-md' });
    const tarZstBuffer = await buffer(
      createTarZstStream([
        { path: 'README.md', type: 'file', mode: 0o644, content: Buffer.from('# readme') }
      ])
    );

    skillExportMocks.streamSkillEditWorkspaceTarZstMock.mockImplementationOnce(
      async ({ onStreamReady }) => onStreamReady(Readable.from([tarZstBuffer]))
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await expect(handler(req, res)).resolves.toMatchObject({
      code: 500,
      error: expect.objectContaining({
        message: expect.stringContaining('Missing required file: SKILL.md')
      })
    });
  });
});
