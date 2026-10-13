import SaveAndPublishModal from '@/components/common/Modal/SaveAndPublishModal';
import { Box, Button, Flex, HStack, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import React, { useState } from 'react';

const SaveButton = ({
  colorSchema,
  isLoading,
  isDisabled = false,
  onClickSave,
  checkData
}: {
  colorSchema: 'primary' | 'black';
  isLoading: boolean;
  isDisabled?: boolean;
  onClickSave: (options: { isPublish?: boolean; versionName?: string }) => Promise<void>;
  checkData?: () => boolean | undefined | Promise<boolean | undefined>;
}) => {
  const { t } = useTranslation();
  const [isSave, setIsSave] = useState(false);
  const { toast } = useToast({
    containerStyle: {
      mt: '60px',
      fontSize: 'sm'
    }
  });

  const {
    isOpen: isSaveAndPublishModalOpen,
    onOpen: onSaveAndPublishModalOpen,
    onClose: onSaveAndPublishModalClose
  } = useDisclosure();

  const { bg, color } = useMemoEnhance(() => {
    if (colorSchema === 'primary') {
      return {
        bg: undefined,
        color: 'primary.600'
      };
    }

    return {
      bg: 'black',
      color: 'myGray.900'
    };
  }, [colorSchema]);

  return (
    <Box
      flexShrink={0}
      sx={{
        section: {
          width: 'auto'
        }
      }}
    >
      <MyPopover
        placement={'bottom-end'}
        hasArrow={false}
        offset={[2, 4]}
        w={'124px'}
        onOpenFunc={() => setIsSave(true)}
        onCloseFunc={() => setIsSave(false)}
        trigger={'hover'}
        Trigger={
          <Button
            w={'95px'}
            h={'34px'}
            bg={bg}
            color={'white'}
            isDisabled={isDisabled}
            _disabled={{
              bg: 'black',
              color: 'white',
              opacity: 0.4,
              cursor: 'not-allowed'
            }}
          >
            <Flex gap={2}>
              <Box>{t('common:Save')}</Box>
              <MyIcon
                name={isSave ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                w={['14px', '16px']}
              />
            </Flex>
          </Button>
        }
      >
        {({ onClose }) => (
          <Box p={1.5}>
            <MyBox
              display={'flex'}
              alignItems={'center'}
              gap={2}
              p={1.5}
              rounded={'4px'}
              _hover={{ color, bg: 'rgba(17, 24, 36, 0.05)' }}
              cursor={'pointer'}
              isLoading={isLoading}
              onClick={async () => {
                await onClickSave({});
                toast({
                  status: 'success',
                  title: t('app:saved_success'),
                  position: 'top-right',
                  isClosable: true
                });
                onClose();
                setIsSave(false);
              }}
            >
              <MyIcon name={'core/workflow/upload'} w={'1rem'} />
              <Box fontSize={'sm'}>{t('common:core.workflow.Save to cloud')}</Box>
            </MyBox>
            <HStack
              p={1.5}
              rounded={'4px'}
              _hover={{ color, bg: 'rgba(17, 24, 36, 0.05)' }}
              cursor={'pointer'}
              onClick={async () => {
                const canOpen =
                  !checkData ||
                  (await Promise.resolve()
                    .then(checkData)
                    .catch(() => {
                      toast({ status: 'error', title: t('common:model_catalog_load_failed') });
                      return false;
                    }));
                if (canOpen) {
                  onSaveAndPublishModalOpen();
                }
                onClose();
                setIsSave(false);
              }}
            >
              <MyIcon name={'core/workflow/publish'} w={'1rem'} />
              <Box fontSize={'sm'}>{t('common:core.workflow.Save and publish')}</Box>
            </HStack>
          </Box>
        )}
      </MyPopover>
      {isSaveAndPublishModalOpen && (
        <SaveAndPublishModal
          isLoading={isLoading}
          onClose={onSaveAndPublishModalClose}
          onConfirm={async (versionName) => {
            await onClickSave({ isPublish: true, versionName });
            toast({
              status: 'success',
              title: t('app:publish_success'),
              position: 'top-right',
              isClosable: true
            });
            onSaveAndPublishModalClose();
          }}
        />
      )}
    </Box>
  );
};

export default React.memo(SaveButton);
