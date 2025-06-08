import { Box, Button, HStack, useDisclosure } from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import React, { useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SaveAndPublishModal from '../../WorkflowComponents/Flow/components/SaveAndPublish';

const SaveButton = ({
  isLoading,
  onClickSave,
  checkData
}: {
  isLoading: boolean;
  onClickSave: (options: { isPublish?: boolean; versionName?: string }) => Promise<void>;
  checkData?: () => boolean | undefined;
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
        w={'116px'}
        onOpenFunc={() => setIsSave(true)}
        onCloseFunc={() => setIsSave(false)}
        trigger={'hover'}
        Trigger={
          <Button
            size={'sm'}
            rightIcon={
              <MyIcon
                name={isSave ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                w={['14px', '16px']}
              />
            }
          >
            <Box>{t('common:Save')}</Box>
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
              _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
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
              _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
              cursor={'pointer'}
              onClick={() => {
                const canOpen = !checkData || checkData();
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
          onClickSave={onClickSave}
        />
      )}
    </Box>
  );
};

export default React.memo(SaveButton);
