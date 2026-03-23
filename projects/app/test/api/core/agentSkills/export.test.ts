import { describe, expect, it, vi, beforeEach } from 'vitest';
import handler from '@/pages/api/core/agentSkills/export';
import { MongoAgentSkills } from '@fastgpt/service/core/agentSkills/schema';
import {
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import { uploadSkillPackage } from '@fastgpt/service/core/agentSkills/storage';
import { getRootUser, getUser } from '@test/datas/users';
import { jsonRes } from '@fastgpt/service/common/response';

const mockJsonRes = vi.mocked(jsonRes);

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

describe('GET /api/core/agentSkills/export', () => {
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

  it('未鉴权请求应返回 500（unAuthorization）', async () => {
    const res = makeMockRes();
    const req = makeMockReq({ query: { skillId: '507f1f77bcf86cd799439011' } }); // no auth

    await handler(req, res);

    // parseHeaderCert throws Error('unAuthorization'); err.message = 'unAuthorization'
    expect(mockJsonRes).toHaveBeenCalledWith(res, { code: 500, error: 'unAuthorization' });
  });

  // ==================== Param validation (now delegated to authSkill) ====================

  it('缺少 skillId 时 authSkill 拒绝访问，返回 500', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: {} }); // no skillId

    await handler(req, res);

    // authSkill rejects with SkillErrEnum.unExist (string), err.message is undefined
    expect(mockJsonRes).toHaveBeenCalledWith(res, { code: 500, error: 'Failed to export skill' });
  });

  it('skillId 格式无效时 MongoDB 抛出 CastError，返回 500', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: 'not-a-valid-object-id' } });

    await handler(req, res);

    // MongoDB CastError has a .message property containing 'ObjectId'
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 500,
      error: expect.stringContaining('ObjectId')
    });
  });

  // ==================== Skill existence validation ====================

  it('Skill 不存在时 authSkill 拒绝访问，返回 500', async () => {
    const user = await getRootUser();
    const res = makeMockRes();
    const req = makeMockReq({
      auth: user,
      query: { skillId: '507f1f77bcf86cd799439011' } // valid ObjectId but no matching document
    });

    await handler(req, res);

    // authSkill rejects with SkillErrEnum.unExist (string), err.message is undefined
    expect(mockJsonRes).toHaveBeenCalledWith(res, { code: 500, error: 'Failed to export skill' });
  });

  // ==================== Business rule validation ====================

  it('文件夹类型不可导出应返回 400', async () => {
    const user = await getRootUser();

    const folder = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.folder,
      source: AgentSkillSourceEnum.personal,
      name: 'test-folder',
      description: '',
      author: user.userId,
      category: [],
      config: {},
      teamId: user.teamId,
      tmbId: user.tmbId,
      currentVersion: 0,
      versionCount: 0
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

  it('无 currentStorage 的 Skill 应返回 404', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'skill-no-storage',
      description: '',
      author: user.userId,
      category: [],
      config: {},
      teamId: user.teamId,
      tmbId: user.tmbId,
      currentVersion: 0,
      versionCount: 0
      // currentStorage intentionally omitted
    });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId: String(skill._id) } });

    await handler(req, res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 404,
      error: 'No active version available for download'
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
      author: owner.userId,
      category: [],
      config: {},
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      currentVersion: 0,
      versionCount: 1
    });

    await MongoAgentSkills.updateOne(
      { _id: skill._id },
      {
        currentStorage: {
          bucket: 'fastgpt-private',
          key: `agent-skills/${owner.teamId}/${skill._id}/v0/package.zip`,
          size: 100
        }
      }
    );

    const res = makeMockRes();
    const req = makeMockReq({ auth: stranger, query: { skillId: String(skill._id) } });

    await handler(req, res);

    // authSkill rejects with SkillErrEnum.unAuthSkill (string), err.message is undefined
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 500,
      error: 'Failed to export skill'
    });

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
      author: user.userId,
      category: [],
      config: {},
      teamId: user.teamId,
      tmbId: user.tmbId,
      currentVersion: 0,
      versionCount: 1
    });

    const skillId = String(skill._id);
    const zipContent = Buffer.from('PK fake zip content for testing');

    const storageInfo = await uploadSkillPackage({
      teamId: user.teamId,
      skillId,
      version: 0,
      zipBuffer: zipContent
    });

    await MongoAgentSkills.updateOne({ _id: skill._id }, { currentStorage: storageInfo });

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

  it('文件名中包含特殊字符时应被替换', async () => {
    const user = await getRootUser();

    const skill = await MongoAgentSkills.create({
      type: AgentSkillTypeEnum.skill,
      source: AgentSkillSourceEnum.personal,
      name: 'skill/with<special>chars',
      description: '',
      author: user.userId,
      category: [],
      config: {},
      teamId: user.teamId,
      tmbId: user.tmbId,
      currentVersion: 0,
      versionCount: 1
    });

    const skillId = String(skill._id);
    const zipContent = Buffer.from('PK minimal zip');

    const storageInfo = await uploadSkillPackage({
      teamId: user.teamId,
      skillId,
      version: 0,
      zipBuffer: zipContent
    });
    await MongoAgentSkills.updateOne({ _id: skill._id }, { currentStorage: storageInfo });

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
      author: 'system',
      category: [],
      config: {},
      teamId: user.teamId, // must match requester's team for authSkill to pass
      tmbId: user.tmbId,
      currentVersion: 0,
      versionCount: 1
    });

    const skillId = String(skill._id);
    const zipContent = Buffer.from('PK system skill zip');

    const storageInfo = await uploadSkillPackage({
      teamId: user.teamId,
      skillId,
      version: 0,
      zipBuffer: zipContent
    });
    await MongoAgentSkills.updateOne({ _id: skill._id }, { currentStorage: storageInfo });

    const res = makeMockRes();
    const req = makeMockReq({ auth: user, query: { skillId } });

    await handler(req, res);

    expect(mockJsonRes).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Buffer.compare(res.endData, zipContent)).toBe(0);

    await MongoAgentSkills.deleteOne({ _id: skill._id });
  });
});
