import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/core/sandbox/proxy/token';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import { signSandboxProxyToken } from '@fastgpt/service/core/sandbox/proxyToken';
import { AgentSkillSourceEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

vi.mock('@fastgpt/service/core/sandbox/proxyToken', () => ({
  signSandboxProxyToken: vi.fn(() => ({
    token: 'signed-proxy-token',
    exp: 1778294762,
    ttl: 1800
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>();
  return {
    ...actual,
    getSandboxProviderConfig: vi.fn(() => ({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token'
    }))
  };
});

describe('sandbox proxy/token', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let sandboxId: string;

  beforeEach(async () => {
    vi.clearAllMocks();

    owner = await getUser(`sandbox-proxy-token-owner-${getNanoid(6)}`);

    const skill = await MongoAgentSkills.create({
      name: 'Proxy Token Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    skillId = String(skill._id);
    sandboxId = getNanoid();

    await MongoSandboxInstance.create([
      {
        provider: 'opensandbox',
        sandboxId,
        appId: getNanoid(),
        userId: getNanoid(),
        chatId: 'edit-debug-old',
        type: SandboxTypeEnum.editDebug,
        status: SandboxStatusEnum.running,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        metadata: {
          teamId: getNanoid(),
          tmbId: getNanoid(),
          skillId: getNanoid(),
          provider: 'opensandbox',
          image: { repository: 'old-image' },
          initializing: false
        }
      },
      {
        provider: 'sealosdevbox',
        sandboxId,
        appId: skillId,
        userId: owner.tmbId,
        chatId: 'edit-debug',
        type: SandboxTypeEnum.editDebug,
        status: SandboxStatusEnum.running,
        lastActiveAt: new Date(),
        createdAt: new Date(),
        metadata: {
          teamId: owner.teamId,
          tmbId: owner.tmbId,
          skillId,
          provider: 'sealosdevbox',
          image: { repository: 'test-image' },
          initializing: false
        }
      }
    ]);
  });

  it('signs a token for a user with skill write permission', async () => {
    const res = await Call(handler, {
      method: 'POST',
      auth: owner,
      body: { sandboxId }
    });

    expect(res.code).toBe(200);
    expect(res.data).toEqual({
      token: 'signed-proxy-token',
      exp: 1778294762,
      ttl: 1800
    });
    expect(signSandboxProxyToken).toHaveBeenCalledWith({
      sid: sandboxId,
      svc: 'code-server'
    });
  });

  it('rejects a read-only collaborator for edit-debug sandbox token', async () => {
    const collaborator = await getUser(
      `sandbox-proxy-token-readonly-${getNanoid(6)}`,
      owner.teamId
    );
    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: skillId,
      tmbId: collaborator.tmbId,
      permission: ReadPermissionVal
    });

    const res = await Call(handler, {
      method: 'POST',
      auth: collaborator,
      body: { sandboxId }
    });

    expect(res.code).not.toBe(200);
    expect(signSandboxProxyToken).not.toHaveBeenCalled();
  });

  it('signs proxy revision into the token payload', async () => {
    const res = await Call(handler, {
      method: 'POST',
      auth: owner,
      body: { sandboxId, proxyRevision: 'endpoint-rev-1' }
    });

    expect(res.code).toBe(200);
    expect(signSandboxProxyToken).toHaveBeenCalledWith({
      sid: sandboxId,
      svc: 'code-server',
      rev: 'endpoint-rev-1'
    });
  });

  it('rejects a same-team member without skill permission', async () => {
    const member = await getUser(`sandbox-proxy-token-member-${getNanoid(6)}`, owner.teamId);

    const res = await Call(handler, {
      method: 'POST',
      auth: member,
      body: { sandboxId }
    });

    expect(res.code).not.toBe(200);
  });
});
