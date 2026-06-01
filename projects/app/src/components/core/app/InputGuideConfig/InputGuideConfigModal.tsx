import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Button, Flex, Switch } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import type { ChatInputGuideConfigType } from '@fastgpt/global/core/app/type';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyInput from '@/components/MyInput';
import { getDocPath } from '@/web/common/system/doc';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useInputGuideConfigForm } from './useInputGuideConfigForm';

type InputGuideConfigModalProps = {
  isOpen: boolean;
  value: ChatInputGuideConfigType;
  total: number;
  onClose: () => void;
  onChange: (e: ChatInputGuideConfigType) => void;
  onOpenLexiconConfig: () => void;
};

const InputGuideConfigModal = ({
  isOpen,
  value,
  total,
  onClose,
  onChange,
  onOpenLexiconConfig
}: InputGuideConfigModalProps) => {
  const { t } = useTranslation();
  const { customUrlRegister, draftOpen, handleConfirmSubmit, setDraftOpen } =
    useInputGuideConfigForm({
      isOpen,
      value,
      total,
      onClose,
      onChange
    });

  return (
    <MyModal
      title={t('app:input_guide')}
      isOpen={isOpen}
      onClose={onClose}
      size={'sm'}
      isCentered
      closeOnOverlayClick={false}
      showCloseButton={false}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button onClick={handleConfirmSubmit}>{t('common:Confirm')}</Button>
        </>
      }
    >
      <Flex flexDirection={'column'} gap={8}>
        <Flex justifyContent={'space-between'} alignItems={'center'}>
          <FormLabel>{t('common:is_open')}</FormLabel>
          <Switch
            isChecked={draftOpen}
            onChange={(e) => {
              setDraftOpen(e.target.checked);
            }}
          />
        </Flex>
        {draftOpen && (
          <>
            <Flex alignItems={'center'}>
              <FormLabel>{t('app:input_guide_lexicon')}</FormLabel>
              <Box fontSize={'xs'} px={2} bg={'myGray.100'} ml={1} rounded={'full'}>
                {total}
              </Box>
              <Box flex={'1 0 0'} />
              <Button
                variant={'whiteBase'}
                size={'sm'}
                leftIcon={<MyIcon boxSize={'4'} name={'common/settingLight'} />}
                onClick={onOpenLexiconConfig}
              >
                {t('app:config_input_guide_lexicon')}
              </Button>
            </Flex>
            <Box>
              <Flex alignItems={'center'}>
                <FormLabel>{t('app:custom_input_guide_url')}</FormLabel>
                <Flex
                  onClick={() => window.open(getDocPath('/guide/build/general/chat_input_guide'))}
                  color={'primary.700'}
                  alignItems={'center'}
                  cursor={'pointer'}
                >
                  <MyIcon name={'book'} w={'17px'} ml={4} mr={1} color={'myGray.600'} />
                  {t('common:Documents')}
                </Flex>
                <Box flex={'1 0 0'} />
              </Flex>
              <MyInput mt={2} bg={'myGray.50'} {...customUrlRegister} />
            </Box>
          </>
        )}
      </Flex>
    </MyModal>
  );
};

export default React.memo(InputGuideConfigModal);
