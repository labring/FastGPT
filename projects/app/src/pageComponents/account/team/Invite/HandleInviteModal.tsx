import { Box, Button, FormControl, Input, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
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
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMemberNameForm } from '@/pageComponents/account/team/MemberNameForm/useMemberNameForm';
import {
  memberNameButtonStyles,
  memberNameInputStyles,
  memberNameLabelStyles
} from '@/pageComponents/account/team/MemberNameForm/styles';

/**
 * 登录后处理团队邀请。接受时一次提交成员名和邀请，拒绝或无效邀请只清理当前上下文。
 * 团队切换失败不回滚接受结果，也不自动重试，继续留在当前 session。
 */
const HandleInviteModal = ({
  inviteLinkId,
  onStart,
  onFinish
}: {
  inviteLinkId: string;
  onStart?: () => void;
  onFinish?: () => void;
}) => {
  const router = useRouter();
  const { t } = useClientTranslation('account_team');
  const { toast } = useToast();
  const { initUserInfo } = useUserStore();
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
    await clearInvitationContext();
    onFinish?.();
  }, [clearInvitationContext, onFinish]);

  const { data: invitationInfo } = useRequest(() => getInvitationInfo(inviteLinkId), {
    manual: false,
    onError: () => {
      void finishInvitation();
    }
  });

  useEffect(() => {
    if (!invitationInfo?.alreadyJoined || alreadyJoinedNotifiedRef.current) return;

    alreadyJoinedNotifiedRef.current = true;
    toast({ status: 'error', title: t('account_team:already_joined') });
    void finishInvitation();
  }, [finishInvitation, invitationInfo?.alreadyJoined, t, toast]);

  // creatorUsername 是可选字段，空串同样需要回落到兜底文案，所以显式判空而不是用 || 覆盖假值。
  const creatorUsername = invitationInfo?.creatorUsername?.trim();
  const inviterName = creatorUsername
    ? creatorUsername
    : t('account_team:invitation_creator_fallback');

  const { runAsync: acceptInvitation, loading: accepting } = useRequest(
    async () => {
      const normalizedMemberName = parseMemberName();
      onStart?.();
      return postAcceptInvitationWithMemberName({
        linkId: inviteLinkId,
        memberName: normalizedMemberName
      });
    },
    {
      manual: true,
      onSuccess: async ({ teamId }) => {
        toast({ status: 'success', title: t('account_team:join_team_success') });
        try {
          await putSwitchTeam(teamId);
          await initUserInfo();
          await clearInvitationContext();
          router.reload();
        } catch {
          toast({ status: 'warning', title: t('account_team:switch_team_failed') });
          await initUserInfo();
          await clearInvitationContext();
        }
        onFinish?.();
      }
    }
  );

  const rejectInvitation = async () => {
    await finishInvitation();
    toast({
      status: 'info',
      title: t('account_team:invitation_rejected', { source: inviterName })
    });
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
      onClose={isMultiTeamMode ? rejectInvitation : undefined}
      showCloseButton={isMultiTeamMode}
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
            {isMultiTeamMode ? t('account_team:join_team') : t('account_team:confirm_member_name')}
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
                fontSize="14px"
                fontWeight={500}
                lineHeight="20px"
                letterSpacing="0.1px"
              >
                {invitationInfo.teamName}
              </Box>
              <Box color="#667085" fontSize="14px" lineHeight="20px" letterSpacing="0.25px">
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
                fontSize="10px"
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
            _placeholder={{ color: '#667085' }}
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
