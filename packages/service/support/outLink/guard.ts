import { assertCancellation } from '../user/account/cancellation/guard';

/** 分享链接没有用户Session，使用发布链接绑定的 tmb/team 校验账号可用性。 */
export const assertOutLinkTeamUsable = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  await assertCancellation({ teamId, tmbId });
};
