import { beforeEach, describe, expect, it } from 'vitest';
import handler from '@/pages/api/core/ai/skill/debugSession/chatItem/delete';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AgentSkillSourceEnum } from '@fastgpt/global/core/ai/skill/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';

describe('debugSession/chatItem/delete permission', () => {
  let owner: Awaited<ReturnType<typeof getUser>>;
  let readonlyUser: Awaited<ReturnType<typeof getUser>>;
  let skillId: string;
  let chatId: string;
  let contentId: string;

  beforeEach(async () => {
    owner = await getUser(`skill-chat-item-owner-${getNanoid(6)}`);
    readonlyUser = await getUser(`skill-chat-item-reader-${getNanoid(6)}`, owner.teamId);

    const skill = await MongoAgentSkills.create({
      name: 'Debug Chat Item Permission Skill',
      source: AgentSkillSourceEnum.personal,
      teamId: owner.teamId,
      tmbId: owner.tmbId
    });
    skillId = String(skill._id);
    chatId = getNanoid();
    contentId = getNanoid();

    await MongoResourcePermission.create({
      resourceType: PerResourceTypeEnum.agentSkill,
      teamId: owner.teamId,
      resourceId: skillId,
      tmbId: readonlyUser.tmbId,
      permission: ReadPermissionVal
    });

    await MongoChatItem.create({
      teamId: owner.teamId,
      tmbId: owner.tmbId,
      appId: skillId,
      chatId,
      dataId: contentId,
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'debug answer' } }]
    });
  });

  it('只读协作者不能删除调试会话消息', async () => {
    const res = await Call(handler, {
      auth: readonlyUser,
      body: { skillId, chatId, contentId }
    });

    expect(res.code).not.toBe(200);
    const item = await MongoChatItem.findOne({ appId: skillId, chatId, dataId: contentId }).lean();
    expect(item?.deleteTime).toBeNull();
  });
});
