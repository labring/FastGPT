import React, { useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { useToast } from '@/web/common/hooks/useToast';
import { useForm } from 'react-hook-form';

type FormType = {
  url?: string | undefined;
  selector?: string | undefined;
};

const WebsiteModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (data: FormType) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { register, handleSubmit } = useForm({
    defaultValues: {
      url: '',
      selector: ''
    }
  });

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/modal/website.svg"
      title={t('core.dataset.collection.Create Website Dataset')}
      onClose={onClose}
      maxW={'500px'}
    >
      <ModalBody>
        <Box fontSize={'sm'} color={'myGray.600'}>
          {t('core.dataset.collection.Create Website Dataset Description')}
        </Box>
        <Box mt={2}>
          <Box>{t('core.dataset.collection.website.Base Url')}</Box>
          <Input
            placeholder={t('core.dataset.collection.Website Link')}
            {...register('url', {
              required: true
            })}
          />
        </Box>
        <Box mt={3}>
          <Box>
            {t('core.dataset.collection.website.Selector')}({t('common.choosable')})
          </Box>
          <Input {...register('selector')} />
        </Box>
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          ml={2}
          onClick={handleSubmit((data) => {
            if (!data.url) return;
            //   check is link
            if (!strIsLink(data.url)) {
              return toast({
                status: 'warning',
                title: t('common.link.UnValid')
              });
            }
            onSuccess(data);
          })}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default WebsiteModal;
