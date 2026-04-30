import { Box, HStack, type BoxProps } from '@chakra-ui/react';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import React from 'react';
import { useTranslation } from 'next-i18next';

const ResumeInherit = ({
  onResume,
  ...props
}: BoxProps & {
  onResume?: () => Promise<any> | any;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { ConfirmModal: CommonConfirmModal, openConfirm: openCommonConfirm } = useConfirm({
    iconSrc: 'common/confirm/info',
    title: t('common:permission.resume_inherit_title')
  });

  return onResume ? (
    <>
      <HStack
        px={3}
        py={2}
        bg={'#F5F9FF'}
        borderRadius={'md'}
        spacing={2}
        align={'center'}
        {...props}
      >
        <MyIcon name={'common/info'} w={'16px'} flexShrink={0} color={'#1464CC'} mt={'1px'} />
        <Box fontSize={'12px'} color={'#1464CC'}>
          {t('common:permission.No InheritPermission')}
          <Box
            as={'span'}
            ml={1}
            textDecoration={'underline'}
            cursor={'pointer'}
            color={'#1464CC'}
            _hover={{ color: 'blue.900' }}
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
        </Box>
      </HStack>
      <CommonConfirmModal />
    </>
  ) : null;
};

export default ResumeInherit;
