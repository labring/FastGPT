import { Box, Flex } from '@chakra-ui/react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { ReactNode } from 'react';

/** 预览和确认步骤共用表格工具栏，切换时保持位置一致。 */
export const ChannelImportToolbar = ({
  channelName,
  children
}: {
  channelName?: string;
  children?: ReactNode;
}) => {
  const { t } = useSafeTranslation();

  return (
    <Flex h="36px" alignItems="center" gap={2} flexShrink={0}>
      <Flex alignItems="center" gap={2} minW={0} maxW="40%">
        <Box fontWeight="500" flexShrink={0}>
          {t('config_model:channel_import_channel')}:
        </Box>
        <Box color="myGray.700" isTruncated title={channelName}>
          {channelName}
        </Box>
      </Flex>
      {children}
    </Flex>
  );
};

const StepContent = ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
  <Flex direction="column" h="100%" minH={0} px={8} pt={6} pb={8} gap={6}>
    <Box flex="1 1 0" minH={0} minW={0}>
      {children}
    </Box>
    {footer && (
      <Flex alignItems="center" justifyContent="flex-end" gap={3} flexShrink={0}>
        {footer}
      </Flex>
    )}
  </Flex>
);

export default StepContent;
