import React, { useState } from 'react';
import { Box, Button, Flex, HStack } from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';

type Props = {
  isOpen: boolean;
  refsCount: number;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | unknown;
};

const ConfirmDeleteSkillModal = ({ isOpen, refsCount, onClose, onConfirm }: Props) => {
  const { t } = useTranslation();
  const [requesting, setRequesting] = useState(false);

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      size={'sm'}
      contentPx={'32px'}
      contentPy={'32px'}
      borderRadius={'10px'}
    >
      <Flex direction={'column'} gap={'24px'}>
        <HStack spacing={'12px'} align={'center'}>
          <Flex
            bg={'yellow.100'}
            borderRadius={'full'}
            p={'4px'}
            align={'center'}
            justify={'center'}
            flexShrink={0}
          >
            <MyIcon name={'common/exclamationMark'} w={'16px'} h={'16px'} color={'yellow.700'} />
          </Flex>
          <Box
            flex={'1 0 0'}
            minW={0}
            fontSize={'20px'}
            fontWeight={'500'}
            lineHeight={'26px'}
            color={'myGray.900'}
          >
            {t('skill:confirm_delete_title')}
          </Box>
        </HStack>

        <Box fontSize={'14px'} lineHeight={'20px'} color={'myGray.900'}>
          <Trans
            i18nKey={'skill:confirm_delete_with_refs'}
            values={{ count: refsCount }}
            components={{ bold: <Box as={'span'} fontWeight={'600'} /> }}
          />
        </Box>

        <HStack spacing={'12px'} justify={'flex-end'}>
          <Button
            size={'sm'}
            variant={'whiteBase'}
            onClick={onClose}
            isDisabled={requesting}
            px={'14px'}
          >
            {t('skill:confirm_delete_cancel')}
          </Button>
          <Button
            size={'sm'}
            variant={'dangerFill'}
            isLoading={requesting}
            px={'14px'}
            onClick={async () => {
              setRequesting(true);
              try {
                await onConfirm();
                onClose();
              } catch (_) {}
              setRequesting(false);
            }}
          >
            {t('skill:confirm_delete_action')}
          </Button>
        </HStack>
      </Flex>
    </MyModal>
  );
};

export default ConfirmDeleteSkillModal;
