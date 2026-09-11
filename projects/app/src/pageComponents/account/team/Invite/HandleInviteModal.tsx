import { Box, Button, FormControl, Input, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getInvitationInfo,
  postAcceptInvitationWithMemberName,
  putSwitchTeam
} from '@/web/support/user/team/api';
import { clearInviteLinkFromRoute } from '@/web/support/user/loginRedirect/invitation';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { TeamMemberNameSchema } from '@fastgpt/global/support/user/team/memberName';

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
  const [memberName, setMemberName] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);
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

  const nameError = useMemo(() => {
    if (!memberName) return t('account_team:member_name_required');
    const result = TeamMemberNameSchema.safeParse(memberName);
    return result.success ? '' : t('account_team:member_name_limit');
  }, [memberName, t]);
  const showNameError = hasInteracted && !!nameError;
  const inviterName =
    invitationInfo?.creatorUsername || t('account_team:invitation_creator_fallback');

  const { runAsync: acceptInvitation, loading: accepting } = useRequest(
    async () => {
      const normalizedMemberName = TeamMemberNameSchema.parse(memberName);
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
      title={t(`account_team:${isMultiTeamMode ? 'team_invitation' : 'set_member_name_title'}`)}
      closeOnOverlayClick={false}
      onClose={isMultiTeamMode ? rejectInvitation : undefined}
      showCloseButton={isMultiTeamMode}
      borderRadius="10px"
      footer={
        <>
          {isMultiTeamMode && (
            <Button
              variant="whiteBase"
              h="32px"
              minH="32px"
              px="14px"
              fontSize="12px"
              lineHeight="16px"
              letterSpacing="0.5px"
              borderRadius="6px"
              isLoading={accepting}
              onClick={rejectInvitation}
            >
              {t('account_team:reject_invitation')}
            </Button>
          )}
          <Button
            variant="primary"
            h="32px"
            minH="32px"
            px="14px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.5px"
            borderRadius="6px"
            isLoading={accepting}
            isDisabled={!!nameError}
            onClick={() => {
              setHasInteracted(true);
              if (!nameError) void acceptInvitation();
            }}
          >
            {t(`account_team:${isMultiTeamMode ? 'join_team' : 'confirm_member_name'}`)}
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
            <Box
              color="#24282C"
              fontSize="12px"
              fontWeight={500}
              lineHeight="16px"
              letterSpacing="0.5px"
            >
              {t('account_team:member_name_label')}
            </Box>
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
            h="32px"
            minH="32px"
            px="12px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.048px"
            borderColor="#E8EBF0"
            borderRadius="6px"
            placeholder={
              isMultiTeamMode
                ? t('account_team:invite_member_name_placeholder')
                : t('account_team:member_name_placeholder')
            }
            _placeholder={{ color: '#667085' }}
            _invalid={{ borderColor: '#E8EBF0', boxShadow: 'none' }}
            onChange={(event) => {
              setHasInteracted(true);
              setMemberName(event.target.value);
            }}
            onBlur={() => setHasInteracted(true)}
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
