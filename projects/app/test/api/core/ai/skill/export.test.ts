import { describe, expect, it, vi, beforeEach } from 'vitest';
import handler from '@/pages/api/core/ai/skill/export';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getRootUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

const skillExportMocks = vi.hoisted(() => ({
  findSandboxInstanceByAppChatTypeMock: vi.fn(),
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
    findSandboxInstanceByAppChatType: skillExportMocks.findSandboxInstanceByAppChatTypeMock
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('编辑沙盒未运行时应返回 404', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'skill-without-sandbox',
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    skillExportMocks.findSandboxInstanceByAppChatTypeMock.mockResolvedValueOnce(null);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: 'Edit sandbox not found or not running'
    });

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });

  it('同 team 用户可成功导出 edit sandbox 工作区内容', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'workspace-skill',
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const workspaceZip = Buffer.from('PK workspace zip content');
    skillExportMocks.findSandboxInstanceByAppChatTypeMock.mockResolvedValueOnce({
      sandboxId: 'edit-sandbox-1',
      status: SandboxStatusEnum.running
    });
    skillExportMocks.packageSkillInSandboxMock.mockResolvedValueOnce(workspaceZip);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(skillExportMocks.packageSkillInSandboxMock).toHaveBeenCalledWith({
      sandboxId: 'edit-sandbox-1',
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

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });
});
