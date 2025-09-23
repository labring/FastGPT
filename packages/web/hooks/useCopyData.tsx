import { useTranslation } from 'next-i18next';
import { useToast } from './useToast';
import { useCallback } from 'react';
import MyModal from '../components/common/MyModal';
import React from 'react';
import { Box, ModalBody } from '@chakra-ui/react';
import Tag from '../components/common/Tag';
import { useCommonStore } from '../store/useCommonStore';

/**
 * copy text data
 */
export const useCopyData = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setCopyContent } = useCommonStore();

  const copyData = useCallback(
    async (
      data: string,
      title: string | null | undefined = t('common:copy_successful'),
      duration = 1000
    ) => {
      data = data.trim();

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(data);
          if (title) {
            toast({
              title,
              status: 'success',
              duration
            });
          }
        } else {
          throw new Error('Clipboard is not supported');
        }
      } catch (error) {
        setCopyContent(data);
      }
    },
    [setCopyContent, t, toast]
  );

  return {
    copyData
  };
};

export const ManualCopyModal = () => {
  const { t } = useTranslation();
  const { copyContent, setCopyContent } = useCommonStore();

  return (
    <MyModal
      isOpen={!!copyContent}
      iconSrc="copy"
      iconColor="primary.600"
      title={t('common:Copy')}
      maxW={['90vw', '500px']}
      w={'100%'}
      onClose={() => setCopyContent(undefined)}
    >
      <ModalBody>
        <Tag w={'100%'} colorSchema="blue">
          {t('common:can_copy_content_tip')}
        </Tag>
        <Box mt={3} borderRadius={'md'} p={3} border={'base'} userSelect={'all'}>
          {copyContent}
        </Box>
      </ModalBody>
    </MyModal>
  );
};
