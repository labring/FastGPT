import { Box, Button, FormControl, FormErrorMessage, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { TeamMemberNameSchema } from '@fastgpt/global/support/user/team/memberName';
import { UNSET_TEAM_MEMBER_NAME } from '@fastgpt/global/support/user/team/constant';

/** 强制补齐当前团队成员名，刷新失败或仍返回保留值时保留弹窗并允许重试。 */
const ForceMemberNameModal = ({ onSuccess }: { onSuccess: () => void }) => {
  const { t } = useClientTranslation('account_team');
  const { initUserInfo, userInfo } = useUserStore();
  const [memberName, setMemberName] = useState(userInfo?.username ?? '');
  const [hasInteracted, setHasInteracted] = useState(false);

  const nameError = useMemo(() => {
    if (!memberName) return t('account_team:member_name_required');
    return TeamMemberNameSchema.safeParse(memberName).success
      ? ''
      : t('account_team:member_name_limit');
  }, [memberName, t]);

  const showNameError = hasInteracted && !!nameError;

  const { runAsync: updateName, loading } = useRequest(
    async () => {
      const normalizedName = TeamMemberNameSchema.parse(memberName);
      await putUpdateMemberName(normalizedName);
      return initUserInfo();
    },
    {
      manual: true,
      onSuccess(userInfo) {
        if (userInfo?.team?.memberName !== UNSET_TEAM_MEMBER_NAME) {
          onSuccess();
        }
      }
    }
  );

  return (
    <MyModal
      isOpen
      title={t('account_team:set_member_name_title')}
      closeOnOverlayClick={false}
      showCloseButton={false}
      footer={
        <Button
          variant="primary"
          h="32px"
          minH="32px"
          px="14px"
          fontSize="12px"
          lineHeight="16px"
          letterSpacing="0.5px"
          borderRadius="6px"
          isLoading={loading}
          onClick={() => {
            setHasInteracted(true);
            if (!nameError) void updateName();
          }}
        >
          {t('account_team:confirm_member_name')}
        </Button>
      }
    >
      <FormControl isInvalid={showNameError}>
        <Box
          mb="8px"
          color="#24282C"
          fontSize="12px"
          fontWeight={500}
          lineHeight="16px"
          letterSpacing="0.5px"
        >
          {t('account_team:member_name_label')}
        </Box>
        <Input
          autoFocus
          value={memberName}
          h="32px"
          minH="32px"
          px="12px"
          fontSize="12px"
          lineHeight="16px"
          letterSpacing="0.048px"
          borderColor="#E8EBF0"
          borderRadius="6px"
          placeholder={t('account_team:invite_member_name_placeholder')}
          _placeholder={{ color: '#667085' }}
          onChange={(event) => {
            setHasInteracted(true);
            setMemberName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !nameError && !loading) {
              event.preventDefault();
              void updateName();
            }
          }}
        />
        {showNameError && <FormErrorMessage>{nameError}</FormErrorMessage>}
      </FormControl>
    </MyModal>
  );
};

export default ForceMemberNameModal;
