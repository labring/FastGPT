import { Box, Button, FormControl, FormErrorMessage, Input } from '@chakra-ui/react';
import type { UserType } from '@fastgpt/global/support/user/type';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { putUpdateMemberName } from '@/web/support/user/team/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { memberNameButtonStyles, memberNameInputStyles, memberNameLabelStyles } from './styles';
import { useMemberNameForm } from './useMemberNameForm';

export type MemberNameFormModalProps = {
  /** 输入框初始值：强制补齐场景传用户名，账号页传当前成员名。 */
  defaultName: string;
  /** 是否允许取消关闭；强制补齐场景必须为 false，避免用户跳过待补齐状态。 */
  dismissible?: boolean;
  placeholder?: string;
  /** 提交并刷新用户信息后回调，参数是刷新后的用户信息；不回调即可保留弹窗等待重试。 */
  onSubmitted: (userInfo: UserType | null) => void;
  onClose?: () => void;
};

/**
 * 成员名表单弹窗：校验规则、提交请求和刷新用户信息统一收敛在这里。
 * 强制补齐成员名和账号页修改成员名只在“能否关闭”和“提交后如何处理结果”上有差别，
 * 因此通过 dismissible 和 onSubmitted 表达，避免两份几乎相同的弹窗实现。
 */
const MemberNameFormModal = ({
  defaultName,
  dismissible = true,
  placeholder,
  onSubmitted,
  onClose
}: MemberNameFormModalProps) => {
  const { t } = useClientTranslation('account_team');
  const { initUserInfo } = useUserStore();
  const { memberName, nameError, showNameError, markInteracted, onNameChange, parseMemberName } =
    useMemberNameForm({ defaultName });

  const { runAsync: updateName, loading } = useRequest(
    async () => {
      await putUpdateMemberName(parseMemberName());
      return initUserInfo();
    },
    {
      manual: true,
      onSuccess: (userInfo) => onSubmitted(userInfo)
    }
  );

  const submit = () => {
    markInteracted();
    if (!nameError) void updateName();
  };

  return (
    <MyModal
      isOpen
      title={t('account_team:set_member_name_title')}
      closeOnOverlayClick={false}
      onClose={dismissible ? onClose : undefined}
      showCloseButton={dismissible}
      borderRadius="10px"
      footer={
        <>
          {dismissible && (
            <Button variant="whiteBase" {...memberNameButtonStyles} onClick={onClose}>
              {t('account_team:cancel_member_name')}
            </Button>
          )}
          <Button
            variant="primary"
            {...memberNameButtonStyles}
            isLoading={loading}
            onClick={submit}
          >
            {t('account_team:confirm_member_name')}
          </Button>
        </>
      }
    >
      <FormControl isInvalid={showNameError}>
        <Box {...memberNameLabelStyles} mb="8px">
          {t('account_team:member_name_label')}
        </Box>
        <Input
          autoFocus
          value={memberName}
          {...memberNameInputStyles}
          maxLength={20}
          placeholder={placeholder}
          _placeholder={{ color: '#667085', fontSize: 'sm' }}
          onChange={onNameChange}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || loading) return;
            event.preventDefault();
            submit();
          }}
        />
        {showNameError && <FormErrorMessage fontSize="mini">{nameError}</FormErrorMessage>}
      </FormControl>
    </MyModal>
  );
};

export default MemberNameFormModal;
