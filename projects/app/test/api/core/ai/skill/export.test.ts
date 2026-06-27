import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/ai/skill/export';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getRootUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { getEditDebugSandboxId } from '@fastgpt/service/core/ai/skill/edit';

const skillExportMocks = vi.hoisted(() => ({
  findSandboxInstanceBySandboxIdAndSourceMock: vi.fn(),
  packageSkillInSandboxMock: vi.fn()
}));

vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/env')>();

  return {
    ...actual,
    serviceEnv: {
      ...actual.serviceEnv,
      AGENT_SANDBOX_PROVIDER: 'opensandbox',
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://mock-opensandbox.local',
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'mock-opensandbox-api-key',
      AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'runtime-image',
      AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: 'test',
      AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: false
    }
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/instance/repository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/instance/repository')>();
  return {
    ...actual,
    findSandboxInstanceBySandboxIdAndSource:
      skillExportMocks.findSandboxInstanceBySandboxIdAndSourceMock
  };
});

vi.mock('@fastgpt/service/core/ai/skill/edit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/edit')>();
  return {
    ...actual,
    packageSkillInSandbox: skillExportMocks.packageSkillInSandboxMock
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

  const expectSandboxLookupForSkill = (skillId: string) => {
    expect(skillExportMocks.findSandboxInstanceBySandboxIdAndSourceMock).toHaveBeenCalledWith({
      provider: 'opensandbox',
      sandboxId: getEditDebugSandboxId(skillId),
      sourceType: 'skillEdit',
      sourceId: skillId,
      status: SandboxStatusEnum.running,
      type: SandboxTypeEnum.editDebug
    });
  };

  it('编辑沙盒未运行时应返回 404', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'skill-without-sandbox' });
    const skillId = String(skill._id);

    skillExportMocks.findSandboxInstanceBySandboxIdAndSourceMock.mockResolvedValueOnce(null);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expectSandboxLookupForSkill(skillId);
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: 'Edit sandbox not found or not running'
    });
  });

  it('同 team 用户可成功导出 edit sandbox 工作区内容', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill' });
    const skillId = String(skill._id);

    const workspaceZip = Buffer.from('PK workspace zip content');
    skillExportMocks.findSandboxInstanceBySandboxIdAndSourceMock.mockResolvedValueOnce({
      sandboxId: 'edit-sandbox-1',
      status: SandboxStatusEnum.running,
      metadata: {
        teamId: user.teamId
      }
    });
    skillExportMocks.packageSkillInSandboxMock.mockResolvedValueOnce(workspaceZip);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expectSandboxLookupForSkill(skillId);
    expect(skillExportMocks.packageSkillInSandboxMock).toHaveBeenCalledWith({
      sandboxId: 'edit-sandbox-1',
      validationMode: 'basicZip',
      workDirectory: expect.any(String)
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

  it('sandbox team 不匹配时应返回 404 且不打包工作区', async () => {
    const user = await getRootUser();
    const skill = await createPersonalSkill({ user, name: 'workspace-skill-team-mismatch' });

    skillExportMocks.findSandboxInstanceBySandboxIdAndSourceMock.mockResolvedValueOnce({
      sandboxId: 'edit-sandbox-1',
      status: SandboxStatusEnum.running,
      metadata: {
        teamId: 'other-team'
      }
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: 'Edit sandbox not found or not running'
    });
    expect(skillExportMocks.packageSkillInSandboxMock).not.toHaveBeenCalled();
  });
});
