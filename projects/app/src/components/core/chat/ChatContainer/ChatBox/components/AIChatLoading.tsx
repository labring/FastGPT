import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import DotLoading from '@fastgpt/web/components/common/MyLoading/DotLoading';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

/** 展示会话加载动画，仅在存在具体状态文案时显示文字。 */
const AIChatLoading = ({ text }: { text?: string }) => (
  <Flex alignItems={'center'} justifyContent={'flex-start'} gap={2} minW={0} maxW={'100%'}>
    {/* 字形的视觉中心略低于行盒中心，仅在有文案时校正圆点位置。 */}
    <Box flexShrink={0} transform={text ? 'translateY(1px)' : undefined}>
      <DotLoading size={'sm'} />
    </Box>
    {text && (
      <MyTooltip label={text} showOnlyWhenOverflow>
        <Box
          minW={0}
          maxW={'320px'}
          color={'myGray.600'}
          fontSize={'16px'}
          lineHeight={'24px'}
          fontWeight={'normal'}
          overflow={'hidden'}
          whiteSpace={'nowrap'}
          textOverflow={'ellipsis'}
        >
          {text}
        </Box>
      </MyTooltip>
    )}
  </Flex>
);

export default React.memo(AIChatLoading);
