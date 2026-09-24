import React from 'react';
import { Box, Text } from '@chakra-ui/react';

type AdminSettingSectionProps = {
  id: string;
  title: string;
  children: React.ReactNode;
  showDivider?: boolean;
};

/**
 * 新版配置页面大区块容器组件。
 * 遵循最新 UI 规范：纯文本粗体标题（无灰色底色），区块间带优雅细分割线，支持 TOC 锚点定位。
 */
const AdminSettingSection = ({
  id,
  title,
  children,
  showDivider = false
}: AdminSettingSectionProps) => {
  return (
    <Box id={id} scrollMarginTop={'24px'}>
      {showDivider && <Box h={'1px'} bg={'myGray.200'} my={8} />}
      <Text fontSize={'lg'} fontWeight={'bold'} color={'myGray.900'} mb={5}>
        {title}
      </Text>
      <Box>{children}</Box>
    </Box>
  );
};

export default React.memo(AdminSettingSection);
