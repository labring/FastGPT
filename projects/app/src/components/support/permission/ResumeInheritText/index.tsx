import { Box, type BoxProps } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import React from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

const ResumeInherit = ({
  onResume,
  ...props
}: BoxProps & {
  onResume?: () => Promise<any> | any;
}) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const { ConfirmModal: CommonConfirmModal, openConfirm: openCommonConfirm } = useConfirm({});

  return onResume ? (
    <Box display={'inline'} fontSize={'sm'} {...props}>
      {t('common:permission.No InheritPermission')}
      <Box
        display={'inline'}
        textDecoration={'underline'}
        cursor={'pointer'}
        _hover={{ color: 'primary.600' }}
        onClick={() => {
          openCommonConfirm({
            onConfirm: () =>
              onResume()?.then(() => {
                toast({
                  title: t('common:permission.Resume InheritPermission Success'),
                  status: 'success'
                });
              }),
            customContent: t('common:permission.Resume InheritPermission Confirm')
          })();
        }}
      >
        {t('common:click_to_resume')}
      </Box>

      <CommonConfirmModal />
    </Box>
  ) : null;
};

export default ResumeInherit;
