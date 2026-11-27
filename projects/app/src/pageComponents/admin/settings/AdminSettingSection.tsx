import React from 'react';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';

type AdminSettingSectionProps = {
  id: string;
  title: string;
  titleRight?: React.ReactNode;
  rightContent?: React.ReactNode;
  children: React.ReactNode;
  showDivider?: boolean;
};

/** 新版配置页面大区块容器组件。title 由调用方传入已翻译字符串。 */
const AdminSettingSection = ({
  id,
  title,
  titleRight,
  rightContent,
  children,
  showDivider = false
}: AdminSettingSectionProps) => {
  return (
    <Box id={id} scrollMarginTop={'24px'}>
      {showDivider && <Box h={'1px'} bg={'myGray.200'} my={8} />}
      <Flex alignItems={'center'} justifyContent={'space-between'} mb={5}>
        <HStack spacing={3} alignItems={'center'}>
          <Text fontSize={'lg'} fontWeight={'bold'} color={'myGray.900'}>
            {title}
          </Text>
          {titleRight}
        </HStack>
        {rightContent}
      </Flex>
      <Box>{children}</Box>
    </Box>
  );
};

export default React.memo(AdminSettingSection);
