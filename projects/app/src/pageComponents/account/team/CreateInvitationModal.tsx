import { postCreateInvitationLink } from '@/web/support/user/team/api';
import {
  Box,
  Button,
  Grid,
  HStack,
  Input,
  ModalBody,
  ModalCloseButton,
  ModalFooter
} from '@chakra-ui/react';
import {
  InvitationLinkCreateType,
  InvitationLinkExpiresType
} from '@fastgpt/service/support/user/team/invitationLink/type';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';

function CreateInvitationModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const expiresOptions: Array<{ label: string; value: InvitationLinkExpiresType }> = [
    { label: t('account_team:30mins'), value: '30m' }, // 30 mins
    { label: t('account_team:7days'), value: '7d' }, // 7 days
    { label: t('account_team:1year'), value: '1y' } // 1 year
  ];

  const usedTimesLimitOptions = [
    { label: t('account_team:unlimited'), value: -1 },
    { label: t('account_team:1person'), value: 1 }
  ];
  const { register, handleSubmit, watch, setValue } = useForm<InvitationLinkCreateType>({
    defaultValues: {
      description: '',
      expires: expiresOptions[1].value,
      usedTimesLimit: usedTimesLimitOptions[1].value
    }
  });

  const expires = watch('expires');
  const usedTimesLimit = watch('usedTimesLimit');

  const { runAsync: createInvitationLink } = useRequest2(postCreateInvitationLink, {
    manual: true,
    successToast: t('common:common.Create Success'),
    errorToast: t('common:common.Create Failed'),
    onFinally: () => onClose()
  });

  return (
    <MyModal
      isOpen
      iconSrc="common/addLight"
      iconColor="primary.500"
      title={<Box>{t('account_team:create_invitation_link')}</Box>}
      minW={'500px'}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <Grid gap={4} w="full" templateColumns="max-content 1fr" alignItems="center">
          <FormLabel required={true}>{t('account_team:invitation_link_description')}</FormLabel>
          <Input
            placeholder={t('account_team:invitation_link_description')}
            {...register('description', { required: true })}
          />

          <FormLabel required={true}>{t('account_team:expires')}</FormLabel>
          <MySelect
            list={expiresOptions}
            value={expires}
            onchange={(val) => setValue('expires', val)}
            minW="120px"
          />

          <FormLabel required={true}>{t('account_team:used_times_limit')}</FormLabel>
          <MySelect
            list={usedTimesLimitOptions}
            value={usedTimesLimit}
            onchange={(val) => setValue('usedTimesLimit', val)}
            minW="120px"
          />
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={false} onClick={onClose} variant="outline">
          {t('common:common.Cancel')}
        </Button>
        <Button isLoading={false} onClick={handleSubmit(createInvitationLink)} ml="4">
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default CreateInvitationModal;
