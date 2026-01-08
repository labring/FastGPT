import { ModalBody, Box, Input, Button, ModalFooter, Grid } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updateCustomDomainVerifyFile } from '@/web/support/customDomain/api';
import { useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';

function domainVerifyModal({ onClose, domain }: { onClose: () => void; domain: string }) {
  const { t } = useTranslation();
  const { watch, handleSubmit, register } = useForm({
    defaultValues: {
      path: '',
      content: ''
    }
  });

  const path = watch('path');
  const content = watch('content');

  const { runAsync: updateVerifyFile, loading: isUpdating } = useRequest2(
    updateCustomDomainVerifyFile,
    {
      manual: true,
      onSuccess: () => {
        onClose();
      },
      successToast: t('common:Success')
    }
  );

  return (
    <MyModal isOpen onClose={onClose} title={t('account:custom_domain.domain_verify')} minW="800px">
      <ModalBody>
        <Grid gridTemplateColumns="1fr 1fr" gap="16px">
          <Box>
            <FormLabel required>{t('account:custom_domain.domain_verify.path')}</FormLabel>
            <Input {...register('path')} />
          </Box>
          <Box>
            <FormLabel required>{t('account:custom_domain.domain_verify.content')}</FormLabel>
            <Input {...register('content')} />
          </Box>
        </Grid>
        <Box mt="2">{t('account:custom_domain.domain_verify.desc', { domain, path, content })}</Box>
      </ModalBody>
      <ModalFooter>
        <Button
          onClick={handleSubmit(() => updateVerifyFile({ domain, path, content }))}
          isLoading={isUpdating}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default domainVerifyModal;
