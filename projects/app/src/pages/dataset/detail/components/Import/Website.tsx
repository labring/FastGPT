import React, { useState } from 'react';
import MyModal from '@/components/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import { strIsLink } from '@fastgpt/global/common/string/tools';
import { useToast } from '@/web/common/hooks/useToast';

const WebsiteModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: (url: string) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [url, setUrl] = useState('');

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
        <Input
          defaultValue={url}
          mt={2}
          placeholder={t('core.dataset.collection.Website Link')}
          onChange={(e) => setUrl(e.target.value)}
        />
      </ModalBody>
      <ModalFooter>
        <Button variant={'base'} onClick={onClose}>
          {t('common.Close')}
        </Button>
        <Button
          isDisabled={!url}
          ml={2}
          onClick={() => {
            if (!url) return;
            //   check is link
            if (!strIsLink(url)) {
              return toast({
                status: 'warning',
                title: t('common.link.UnValid')
              });
            }
            onSuccess(url);
          }}
        >
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default WebsiteModal;
