import { Box, Button, FormControl, FormErrorMessage, Input } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useMemo, useState } from 'react';
import { TeamMemberNameSchema } from '@fastgpt/global/support/user/team/memberName';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';

/** 修改当前团队成员名，成功后刷新用户信息并关闭弹窗。 */
const MemberNameModal = ({ memberName, onClose }: { memberName: string; onClose: () => void }) => {
  const { t } = useClientTranslation('account_team');
  const { initUserInfo } = useUserStore();
  const [value, setValue] = useState(memberName);
  const [hasInteracted, setHasInteracted] = useState(false);

  const nameError = useMemo(() => {
    if (!value) return t('account_team:member_name_required');
    return TeamMemberNameSchema.safeParse(value).success ? '' : t('account_team:member_name_limit');
  }, [t, value]);
  const showNameError = hasInteracted && !!nameError;

  const { runAsync: updateName, loading } = useRequest(
    async () => {
      const normalizedName = TeamMemberNameSchema.parse(value);
      await putUpdateMemberName(normalizedName);
      await initUserInfo();
    },
    {
      manual: true,
      onSuccess: onClose
    }
  );

  return (
    <MyModal
      isOpen
      title={t('account_team:set_member_name_title')}
      closeOnOverlayClick={false}
      onClose={onClose}
      borderRadius="10px"
      footer={
        <>
          <Button
            variant="whiteBase"
            h="32px"
            minH="32px"
            px="14px"
            fontSize="12px"
            lineHeight="16px"
            letterSpacing="0.5px"
            borderRadius="6px"
            onClick={onClose}
          >
            {t('account_team:cancel_member_name')}
          </Button>
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
        </>
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
          value={value}
          h="32px"
          minH="32px"
          px="12px"
          maxLength={20}
          fontSize="12px"
          lineHeight="16px"
          letterSpacing="0.048px"
          borderColor="#E8EBF0"
          borderRadius="6px"
          onChange={(event) => {
            setHasInteracted(true);
            setValue(event.target.value);
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

export default MemberNameModal;
