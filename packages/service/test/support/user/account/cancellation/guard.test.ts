import { beforeEach, describe, expect, it } from 'vitest';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { AccountCancellationStatusEnum } from '@fastgpt/global/support/user/account/cancellation/constants';
import { Types } from '@fastgpt/service/common/mongo';
import { assertAccountUsable } from '@fastgpt/service/support/user/account/cancellation/guard';
import { MongoAccountCancellation } from '@fastgpt/service/support/user/account/cancellation/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertAccountUsable', () => {
  beforeEach(async () => {
    await Promise.all([
      MongoAccountCancellation.deleteMany({}),
      MongoTeamMember.deleteMany({}),
      MongoTeam.deleteMany({})
    ]);
  });

  it('resolves the actual API Key member from tmbId when teamId is already present', async () => {
    const userId = new Types.ObjectId();
    const [team] = await MongoTeam.create([
      {
        name: 'API Key cancellation team',
        ownerId: new Types.ObjectId()
      }
    ]);
    const [member] = await MongoTeamMember.create([
      {
        teamId: team._id,
        userId,
        name: 'Member',
        status: 'active'
      }
    ]);
    await MongoAccountCancellation.create([
      {
        userId,
        status: AccountCancellationStatusEnum.pending,
        requestedAt: new Date()
      }
    ]);

    await expect(
      assertAccountUsable({
        teamId: String(team._id),
        tmbId: String(member._id)
      })
    ).rejects.toThrow(UserErrEnum.accountCancellationPending);
  });
});
