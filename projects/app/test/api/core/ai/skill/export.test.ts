import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/ai/skill/export';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getRootUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';
import { SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR } from '@fastgpt/service/core/ai/sandbox/interface/skillEdit';

const skillExportMocks = vi.hoisted(() => ({
  packageSkillEditWorkspaceMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/skillEdit', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/interface/skillEdit')>();
  return {
    ...actual,
    packageSkillEditWorkspace: skillExportMocks.packageSkillEditWorkspaceMock
  };
});

const mockJsonRes = vi.mocked(jsonRes);

function makeMockRes() {
  const headers: Record<string, any> = {};
  let endData: any;
  let statusCode = 200;

  const res: any = {
    get headers() {
      return headers;
    },
    get endData() {
      return endData;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader: vi.fn((key: string, value: any) => {
      headers[key] = value;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    end: vi.fn((data?: any) => {
      endData = data;
    }),
    json: vi.fn()
  };
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

    skillExportMocks.packageSkillEditWorkspaceMock.mockRejectedValueOnce(
      new Error(SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR)
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(skillExportMocks.packageSkillEditWorkspaceMock).toHaveBeenCalledWith({
      skillId,
      teamId: user.teamId,
      validationMode: 'basicZip'
    });
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR
    });
  });

  it('同 team 用户可成功导出 edit sandbox 工作区内容', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill' });
    const skillId = String(skill._id);

    const workspaceZip = Buffer.from('PK workspace zip content');
    skillExportMocks.packageSkillEditWorkspaceMock.mockResolvedValueOnce(workspaceZip);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(skillExportMocks.packageSkillEditWorkspaceMock).toHaveBeenCalledWith({
      skillId,
      teamId: user.teamId,
      validationMode: 'basicZip'
    });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining("attachment; filename*=UTF-8''")
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', workspaceZip.length);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Buffer.compare(res.endData, workspaceZip)).toBe(0);
  });

  it('sandbox team 不匹配时应返回 404', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill-team-mismatch' });
    const skillId = String(skill._id);

    skillExportMocks.packageSkillEditWorkspaceMock.mockRejectedValueOnce(
      new Error(SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR)
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(skillExportMocks.packageSkillEditWorkspaceMock).toHaveBeenCalledWith({
      skillId,
      teamId: user.teamId,
      validationMode: 'basicZip'
    });
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: SKILL_EDIT_SANDBOX_NOT_RUNNING_ERROR
    });
  });

  it('工作区打包失败时应继续抛出原始错误', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-package-error' });
    const packageError = new Error('package failed');

    skillExportMocks.packageSkillEditWorkspaceMock.mockRejectedValueOnce(packageError);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await expect(handler(req, res)).resolves.toMatchObject({
      code: 500,
      error: packageError
    });
    expect(mockJsonRes).not.toHaveBeenCalled();
  });
});
