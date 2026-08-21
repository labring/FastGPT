export type PostLoginAction =
  | 'invitation'
  | 'memberName'
  | 'resetExpiredPassword'
  | 'contact'
  | 'systemMessage'
  | 'importantInform'
  | 'activityAd'
  | 'enterpriseAuthNotice';

/** 按设计文档规定的顺序选择下一个登录后动作，已完成动作直接跳过。 */
export const getNextPostLoginAction = ({
  canStart,
  completed,
  inviteLinkId,
  hasPendingMemberName,
  shouldShowContact,
  contactHandled,
  isPlus,
  hasImportantInform
}: {
  canStart: boolean;
  completed: ReadonlySet<PostLoginAction>;
  inviteLinkId: string;
  hasPendingMemberName: boolean;
  shouldShowContact: boolean;
  contactHandled: boolean;
  isPlus: boolean;
  hasImportantInform: boolean;
}) => {
  if (!canStart) return undefined;

  const candidates: Array<PostLoginAction | undefined> = [
    inviteLinkId ? 'invitation' : undefined,
    hasPendingMemberName ? 'memberName' : undefined,
    isPlus ? 'resetExpiredPassword' : undefined,
    shouldShowContact && !contactHandled ? 'contact' : undefined,
    isPlus ? 'systemMessage' : undefined,
    isPlus && hasImportantInform ? 'importantInform' : undefined,
    isPlus ? 'activityAd' : undefined,
    isPlus ? 'enterpriseAuthNotice' : undefined
  ];

  return candidates.find((action) => action && !completed.has(action));
};
