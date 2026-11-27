import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import JSZip from 'jszip';
import handler from '@/pages/api/core/ai/skill/export';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getRootUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { UserError } from '@fastgpt/global/common/error/utils';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const skillExportMocks = vi.hoisted(() => ({
  streamSkillEditWorkspaceZipMock: vi.fn()
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
      streamSkillEditWorkspaceZip: skillExportMocks.streamSkillEditWorkspaceZipMock
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

  it('同 team 用户可流式将 edit sandbox 工作区导出为 .zip', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill' });
    const skillId = String(skill._id);

    skillExportMocks.streamSkillEditWorkspaceZipMock.mockImplementationOnce(
      async ({ createArchive, onHeadersReady, outputStream }) => {
        onHeadersReady();
        const archive = createArchive();
        const task = pipeline(archive as unknown as NodeJS.ReadableStream, outputStream);
        archive.append(Buffer.alloc(0), { name: 'skills/' });
        archive.append(Buffer.alloc(0), { name: 'skills/demo/' });
        archive.append(Buffer.from('---\nname: demo\n---\n# Demo'), {
          name: 'skills/demo/SKILL.md',
          mode: 0o644
        });
        archive.append(Buffer.alloc(0), { name: 'skills/demo/empty.txt', mode: 0o644 });
        await archive.finalize();
        await task;
      }
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(skillExportMocks.streamSkillEditWorkspaceZipMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId,
        teamId: user.teamId,
        outputStream: res,
        createArchive: expect.any(Function),
        onHeadersReady: expect.any(Function)
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

  it('工作区打包失败时应透传原始错误交由 NextAPI 处理', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-package-error' });
    const packageError = new UserError(SkillErrEnum.editSandboxNotRunning);

    skillExportMocks.streamSkillEditWorkspaceZipMock.mockRejectedValueOnce(packageError);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await expect(handler(req, res)).resolves.toMatchObject({
      code: 500,
      error: packageError
    });
    expect(mockJsonRes).not.toHaveBeenCalled();
  });

  it('工作区打包缺少 SKILL.md 时应向上抛出错误', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-missing-skill-md' });

    skillExportMocks.streamSkillEditWorkspaceZipMock.mockRejectedValueOnce(
      new Error(
        'Missing required file: SKILL.md (expected at root or inside a top-level directory)'
      )
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
