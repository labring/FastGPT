import { useI18n } from '@/web/context/I18n';
import { Box, BoxProps } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import React from 'react';

const ResumeInherit = ({
  onResume,
  ...props
}: BoxProps & {
  onResume?: () => Promise<any> | any;
}) => {
  const { commonT } = useI18n();
  const { toast } = useToast();
  const { ConfirmModal: CommonConfirmModal, openConfirm: openCommonConfirm } = useConfirm({});

  return onResume ? (
    <Box display={'inline'} fontSize={'sm'} {...props}>
      {commonT('permission.No InheritPermission')}
      <Box
        display={'inline'}
        textDecoration={'underline'}
        cursor={'pointer'}
        _hover={{ color: 'primary.600' }}
        onClick={() => {
          openCommonConfirm(
            () =>
              onResume()?.then(() => {
                toast({
                  title: commonT('permission.Resume InheritPermission Success'),
                  status: 'success'
                });
              }),
            undefined,
            commonT('permission.Resume InheritPermission Confirm')
          )();
        }}
      >
        {commonT('click_to_resume')}
      </Box>

      <CommonConfirmModal />
    </Box>
  ) : null;
};

export default ResumeInherit;
