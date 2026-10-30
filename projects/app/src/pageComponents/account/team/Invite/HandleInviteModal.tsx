import { Box, Button, FormControl, Input, Flex } from '@chakra-ui/react';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { getErrText, ToastHandledError } from '@fastgpt/global/common/error/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef } from 'react';
import {
  getInvitationInfo,
  postAcceptInvitationWithMemberName,
  putSwitchTeam
} from '@/web/support/user/team/api';
import { clearInviteLinkFromRoute } from '@/web/support/user/loginRedirect/invitation';
import { useUserStore } from '@/web/support/user/useUserStore';
import { saveInvitationResultToast } from '@/web/support/user/team/useInvitationResultToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemberNameForm } from '@/pageComponents/account/team/MemberNameForm/useMemberNameForm';
import {
  memberNameButtonStyles,
  memberNameInputStyles,
  memberNameLabelStyles
} from '@/pageComponents/account/team/MemberNameForm/styles';

/**
 * 登录后处理团队邀请。接受时一次提交成员名和邀请，已加入时直接切换到目标团队。
 * 拒绝或无效邀请只清理当前上下文；团队切换失败不回滚接受结果，也不自动重试。
 * inviteLinkId 由编排器在加锁时快照传入，因此这里清理路由上的邀请参数不会把自己卸载掉。
 */
const HandleInviteModal = ({
  inviteLinkId,
  onFinish
}: {
  inviteLinkId: string;
  onFinish?: () => void;
}) => {
  const router = useRouter();
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const { userInfo, initUserInfo } = useUserStore();
  const userId = userInfo?._id;
  const currentTeamId = userInfo?.team.teamId;
  const { feConfigs } = useSystemStore();
  const isMultiTeamMode = feConfigs?.teamMode !== 'single';
  const { memberName, nameError, showNameError, markInteracted, onNameChange, parseMemberName } =
    useMemberNameForm({ defaultName: '' });
  const alreadyJoinedNotifiedRef = useRef(false);

  const clearInvitationContext = useCallback(async () => {
    const nextRoute = clearInviteLinkFromRoute(router.asPath);
    await router.replace(nextRoute, undefined, { shallow: true });
  }, [router]);

  const finishInvitation = useCallback(async () => {
    try {
      await clearInvitationContext();
    } catch (error) {
      console.error('[Team invitation] Failed to clear invitation route:', error);
    } finally {
      // 路由清理是非关键收尾，失败时也必须释放编排锁，避免后续登录动作永久停滞。
      onFinish?.();
    }
  }, [clearInvitationContext, onFinish]);

  const { data: invitationInfo } = useRequest(() => getInvitationInfo(inviteLinkId), {
    manual: false,
    onError: () => {
      void finishInvitation();
    }
  });

  /**
   * 已在目标团队时只清理邀请；跨团队时直接跳转到清理后的地址，由新页面显示结果。
   * 跳转前不更新 userInfo 或释放编排锁，避免新团队重复处理邀请、后续弹窗短暂闪现。
   */
  const switchToInvitedTeam = useCallback(
    async (teamId: string, alreadyJoined = true) => {
      const status = alreadyJoined ? 'info' : 'success';
      if (currentTeamId === teamId) {
        await finishInvitation();
        toast({
          status,
          title: t(
            alreadyJoined ? 'account_team:already_joined' : 'account_team:join_team_success'
          ),
          duration: 3000
        });
        return;
      }

      try {
        await putSwitchTeam(teamId);
      } catch {
        toast({ status: 'warning', title: t('account_team:switch_team_failed') });
        await initUserInfo().catch((error) => {
          console.error('[Team invitation] Failed to refresh user info:', error);
        });
        await finishInvitation();
        return;
      }

      saveInvitationResultToast({ userId: userId ?? '', teamId, status });
      // 使用浏览器实际地址保留部署和语言前缀，清理邀请后整页刷新并在目标页展示 toast。
      window.location.replace(clearInviteLinkFromRoute(window.location.href));
    },
    [currentTeamId, finishInvitation, initUserInfo, t, toast, userId]
  );

  useEffect(() => {
    if (!invitationInfo?.alreadyJoined || alreadyJoinedNotifiedRef.current) return;

    alreadyJoinedNotifiedRef.current = true;
    void switchToInvitedTeam(invitationInfo.teamId);
  }, [invitationInfo?.alreadyJoined, invitationInfo?.teamId, switchToInvitedTeam]);

  // 优先展示邀请人的团队成员名；历史邀请没有成员 ID 时回落到用户名。
  const creatorMemberName = invitationInfo?.creatorMemberName?.trim();
  const creatorUsername = invitationInfo?.creatorUsername?.trim();
  const inviterName =
    creatorMemberName || creatorUsername || t('account_team:invitation_creator_fallback');

  const { runAsync: acceptInvitation, loading: accepting } = useRequest(
    async () => {
      const normalizedMemberName = parseMemberName();
      return postAcceptInvitationWithMemberName({
        linkId: inviteLinkId,
        memberName: normalizedMemberName
      });
    },
    {
      manual: true,
      // 已加入属于可继续切换团队的状态，避免通用请求层再弹出 error 提示。
      errorToast: '',
      onError: async (error: Error) => {
        const statusText = (error as Error & { statusText?: string }).statusText;
        if (statusText === TeamErrEnum.youHaveBeenInTheTeam && invitationInfo) {
          await switchToInvitedTeam(invitationInfo.teamId);
          return;
        }

        if (!(error instanceof ToastHandledError)) {
          toast({ status: 'error', title: t(getErrText(error, 'Error')) });
        }
        if (statusText === TeamErrEnum.invitationLinkInvalid) {
          await finishInvitation();
        }
      },
      onSuccess: async ({ teamId }) => {
        await switchToInvitedTeam(teamId, false);
      }
    }
  );

  const rejectInvitation = async () => {
    await finishInvitation();
  };

  if (!invitationInfo || invitationInfo.alreadyJoined) return null;

  return (
    <MyModal
      isOpen
      title={
        isMultiTeamMode
          ? t('account_team:team_invitation')
          : t('account_team:set_member_name_title')
      }
      closeOnOverlayClick={false}
      showCloseButton={false}
      borderRadius="10px"
      footer={
        <>
          {isMultiTeamMode && (
            <Button
              variant="whiteBase"
              {...memberNameButtonStyles}
              isLoading={accepting}
              onClick={rejectInvitation}
            >
              {t('account_team:reject_invitation')}
            </Button>
          )}
          <Button
            variant="primary"
            {...memberNameButtonStyles}
            isLoading={accepting}
            isDisabled={!!nameError}
            onClick={() => {
              markInteracted();
              if (!nameError) void acceptInvitation();
            }}
          >
            {isMultiTeamMode
              ? t('account_team:accept_invitation')
              : t('account_team:confirm_member_name')}
          </Button>
        </>
      }
    >
      <Box display="flex" flexDirection="column" gap="16px" w="full">
        {isMultiTeamMode && (
          <Flex alignItems="center" gap="12px" h="44px">
            <Avatar
              src={invitationInfo.teamAvatar}
              w="36px"
              h="36px"
              borderRadius="full"
              objectFit="cover"
            />
            <Box display="flex" flexDirection="column" gap="4px">
              <Box
                color="#111824"
                fontSize="sm"
                fontWeight={500}
                lineHeight="20px"
                letterSpacing="0.1px"
              >
                {invitationInfo.teamName}
              </Box>
              <Box color="#667085" fontSize="sm" lineHeight="20px" letterSpacing="0.25px">
                {t('account_team:invited_by', { source: inviterName })}
              </Box>
            </Box>
          </Flex>
        )}
        <FormControl isInvalid={showNameError}>
          <Box display="flex" alignItems="center" justifyContent="space-between" w="full" mb="8px">
            <Box {...memberNameLabelStyles}>{t('account_team:member_name_label')}</Box>
            {showNameError && (
              <Box
                color="#D92D20"
                fontSize="mini"
                fontWeight={500}
                lineHeight="14px"
                letterSpacing="0.2px"
              >
                {nameError}
              </Box>
            )}
          </Box>
          <Input
            value={memberName}
            {...memberNameInputStyles}
            placeholder={
              isMultiTeamMode
                ? t('account_team:invite_member_name_placeholder')
                : t('account_team:member_name_placeholder')
            }
            _placeholder={{ color: '#667085', fontSize: 'sm' }}
            _invalid={{ borderColor: '#E8EBF0', boxShadow: 'none' }}
            onChange={onNameChange}
            onBlur={markInteracted}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !nameError && !accepting) {
                event.preventDefault();
                void acceptInvitation();
              }
            }}
          />
        </FormControl>
      </Box>
    </MyModal>
  );
};

export default HandleInviteModal;
