import { describe, expect, it, vi, beforeEach } from 'vitest';
import handler from '@/pages/api/core/ai/skill/export';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { AgentSkillSourceEnum, AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { uploadSkillPackage } from '@fastgpt/service/core/ai/skill/package';
import { Types } from '@fastgpt/service/common/mongo';
import { getRootUser, getUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
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

async function bindCurrentVersion(params: { skillId: string; tmbId: string; storageKey: string }) {
  const versionId = new Types.ObjectId();
  await MongoAgentSkillsVersion.create({
    _id: versionId,
    skillId: params.skillId,
    tmbId: params.tmbId,
    storageKey: params.storageKey
  });
  await MongoAgentSkills.updateOne(
    { _id: params.skillId },
    { $set: { currentVersionId: versionId } }
  );
}

/**
 * Build a chainable mock res object that supports res.status(code).end(data).
 */
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

/**
 * Build a mock req object (auth is resolved by the mocked parseHeaderCert).
 */
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

  // ==================== Method validation ====================

  it('非 GET 请求应返回 405', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({ method: 'POST', auth: user });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, { code: 405, error: 'Method not allowed' });
  });

  // ==================== Auth validation ====================

  it('未鉴权请求应返回 401（unAuthorization）', async () => {
    const res = makeMockRes();
    const req = makeMockReq({ query: { skillId: '507f1f77bcf86cd799439011' } }); // no auth

    const result = (await handler(req, res)) as any;

    expect(result.code).toBe(500);
    expect(result.error.message).toBe('unAuthorization');
  });

  // ==================== Param validation ====================

  it('缺少 skillId 时 Zod 校验失败，返回 400', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: {} }); // no skillId

    const result = (await handler(req, res)) as any;

    expect(result.code).toBe(500);
    expect(result.error).toBeInstanceOf(ApiRequestInputParseError);
  });

  it('skillId 格式无效时 MongoDB 抛出 CastError，返回 500', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: 'not-a-valid-object-id' } });

    const result = (await handler(req, res)) as any;

    expect(result.code).toBe(500);
    expect(result.error.message).toContain('ObjectId');
  });

  // ==================== Skill existence validation ====================

  it('Skill 不存在时 authSkill 拒绝访问，返回 500', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({
      auth: user,
      query: { skillId: '507f1f77bcf86cd799439011' } // valid ObjectId but no matching document
    });

    const result = (await handler(req, res)) as any;

    expect(result.code).toBe(500);
    expect(result.error).toBe('skillUnExist');
  });

  // ==================== Business rule validation ====================

  it('文件夹类型不可导出应返回 400', async () => {
    const user = await getRootUser();

    const folder = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      name: 'test-folder',
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(folder._id) } });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 400,
      error: 'Folders cannot be exported'
    });

    await MongoAgentSkills.deleteOne({ _id: folder._id });
  });

  it('无 currentVersionId 的 Skill 应返回 404', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'skill-no-storage',
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
      // currentVersionId intentionally omitted
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: 'No current version available for download'
    });

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });

  // ==================== Permission validation ====================

  it('跨团队访问 personal skill 时 authSkill 拒绝，返回 500', async () => {
    const owner = await getRootUser();
    const stranger = await getUser('stranger-user'); // different team

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'owner-private-skill',
      description: '',
      category: [],
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: stranger, query: { skillId: String(skill._id) } });

    const result = (await handler(req, res)) as any;

    expect(result.code).toBe(500);
    expect(result.error).toBe('unAuthSkill');

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });

  // ==================== Success path ====================

  it('同 team 用户可成功下载 personal skill 的 ZIP', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'my-skill',
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const skillId = String(skill._id);
    const zipContent = Buffer.from('PK fake zip content for testing');

    const storageInfo = await uploadSkillPackage({
      teamId: user.teamId,
      skillId,
      packageObjectId: 'personal-v0',
      zipBuffer: zipContent
    });

    await bindCurrentVersion({
      skillId,
      tmbId: user.tmbId,
      storageKey: storageInfo.key
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    // jsonRes should NOT be called on success path (binary response written directly)
    expect(mockJsonRes).not.toHaveBeenCalled();

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining("attachment; filename*=UTF-8''")
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', zipContent.length);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
    expect(Buffer.compare(res.endData, zipContent)).toBe(0);

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });

  it('指定 workspace 来源时应直接导出 edit sandbox 工作区内容', async () => {
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

    const skillId = String(skill._id);
    const workspaceZip = Buffer.from('PK workspace zip content');
    skillExportMocks.findSandboxInstanceByAppChatTypeMock.mockResolvedValueOnce({
      sandboxId: 'edit-sandbox-1',
      status: SandboxStatusEnum.running
    });
    skillExportMocks.packageSkillInSandboxMock.mockResolvedValueOnce(workspaceZip);

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId, source: 'workspace' } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(skillExportMocks.packageSkillInSandboxMock).toHaveBeenCalledWith({
      sandboxId: 'edit-sandbox-1',
      workDirectory: expect.any(String)
    });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', workspaceZip.length);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Buffer.compare(res.endData, workspaceZip)).toBe(0);

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });

  it('文件名中包含特殊字符时应被替换', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'skill/with<special>chars',
      description: '',
      category: [],
      teamId: user.teamId,
      tmbId: user.tmbId
    });

    const skillId = String(skill._id);
    const zipContent = Buffer.from('PK minimal zip');

    const storageInfo = await uploadSkillPackage({
      teamId: user.teamId,
      skillId,
      packageObjectId: 'special-name-v0',
      zipBuffer: zipContent
    });
    await bindCurrentVersion({
      skillId,
      tmbId: user.tmbId,
      storageKey: storageInfo.key
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();

    // Content-Disposition filename must not contain < > /
    const disposition: string = res.headers['Content-Disposition'] ?? '';
    expect(disposition).not.toMatch(/[/<>]/);

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });

  it('system skill 属于同 team 时可成功下载', async () => {
    const user = await getRootUser();

    // System skill owned by user's team
    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.system,
      name: 'system-skill',
      description: '',
      category: [],
      teamId: user.teamId, // must match requester's team for authSkill to pass
      tmbId: user.tmbId
    });

    const skillId = String(skill._id);
    const zipContent = Buffer.from('PK system skill zip');

    const storageInfo = await uploadSkillPackage({
      teamId: user.teamId,
      skillId,
      packageObjectId: 'system-v0',
      zipBuffer: zipContent
    });
    await bindCurrentVersion({
      skillId,
      tmbId: user.tmbId,
      storageKey: storageInfo.key
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Buffer.compare(res.endData, zipContent)).toBe(0);

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });
});
