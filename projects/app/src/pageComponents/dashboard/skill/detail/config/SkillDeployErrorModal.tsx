import React from 'react';
import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LightTip from '@fastgpt/web/components/common/LightTip';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';

export type SkillDeployError = {
  /** 引擎返回的稳定错误标识（statusText），用于给出针对性的说明。 */
  statusText?: string;
  /** 引擎返回的详细信息，通常包含识别到的目录/文件。 */
  message: string;
};

/**
 * 发布失败弹窗。
 *
 * 已知错误码给出「怎么回事 + 怎么修」，未知错误给通用说明；下方始终展示引擎原文，
 * 避免把技术细节丢给一行 toast。
 */
const SkillDeployErrorModal = ({
  error,
  onClose
}: {
  error?: SkillDeployError;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  if (!error) return null;

  const isLayoutError = error.statusText === SkillErrEnum.workspaceLayoutInvalid;

  return (
    <MyModal
      isOpen
      isCentered
      size={'md'}
      title={t('skill:deploy_failed')}
      onClose={onClose}
      footer={
        <Button variant={'primary'} onClick={onClose}>
          {t('skill:deploy_error_confirm')}
        </Button>
      }
    >
      <Flex flexDirection={'column'} gap={4}>
        <Flex alignItems={'flex-start'} gap={2}>
          <MyIcon
            name={'common/errorFill'}
            w={'20px'}
            color={'red.600'}
            mt={'2px'}
            flexShrink={0}
          />
          <Box fontSize={'sm'} color={'myGray.700'} lineHeight={'20px'}>
            {isLayoutError ? t('skill:deploy_error_layout_desc') : t('skill:deploy_error_desc')}
            {isLayoutError && (
              <Box mt={2} color={'myGray.600'}>
                {t('skill:deploy_error_layout_action')}
              </Box>
            )}
          </Box>
        </Flex>

        {isLayoutError && <LightTip text={t('skill:deploy_error_layout_tip')} />}

        <Box>
          <Text fontSize={'sm'} color={'myGray.600'} mb={2}>
            {t('skill:deploy_error_detail')}
          </Text>
          <CopyBox
            value={error.message}
            p={3}
            borderRadius={'md'}
            border={'1px solid'}
            borderColor={'myGray.250'}
            bg={'myGray.50'}
            fontSize={'xs'}
            fontFamily={'mono'}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            maxH={'200px'}
            overflowY={'auto'}
          >
            {error.message}
          </CopyBox>
        </Box>
      </Flex>
    </MyModal>
  );
};

export default React.memo(SkillDeployErrorModal);
