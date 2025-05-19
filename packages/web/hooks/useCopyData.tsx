import { useTranslation } from 'next-i18next';
import { useToast } from './useToast';
import { useCallback } from 'react';
import { hasHttps } from '../common/system/utils';
import { isProduction } from '@fastgpt/global/common/system/constants';
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
      title: string | null | undefined = t('common:common.Copy Successful'),
      duration = 1000
    ) => {
      data = data.trim();

      try {
        if ((hasHttps() || !isProduction) && navigator.clipboard) {
          await navigator.clipboard.writeText(data);
          if (title) {
            toast({
              title,
              status: 'success',
              duration
            });
          }
        } else {
          throw new Error('');
        }
      } catch (error) {
        setCopyContent(data);
      }
    },
    [t, toast]
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
      title={t('common:common.Copy')}
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
