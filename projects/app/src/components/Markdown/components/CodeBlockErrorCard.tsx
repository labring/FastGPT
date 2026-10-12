import React from 'react';
import { Box, Flex, HStack, Text, Button } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';

export type CodeBlockErrorCardProps = {
  /** 错误描述标题文案 */
  title: string;
  /** 代码块原始代码，点击复制时写入剪贴板 */
  code: string;
};

/**
 * 富图表与代码块统一的错误展示卡片：
 * 1. 视觉风格与整体卡片规范统一（微灰背景、细边框、红色错误图标）；
 * 2. 隐藏全屏与多媒体导出等无效操作，提供显眼的「复制代码」按钮方便用户检查或重试；
 * 3. 供 ECharts、Mermaid 等富组件复用。
 */
export const CodeBlockErrorCard = ({ title, code }: CodeBlockErrorCardProps) => {
  const { t } = useTranslation();
  const { copyData } = useCopyData();

  return (
    <Box
      my={3}
      p={3}
      borderRadius={'md'}
      bg={'myGray.50'}
      border={'1px solid'}
      borderColor={'myGray.200'}
    >
      <Flex alignItems={'center'} justifyContent={'space-between'} gap={2}>
        <HStack spacing={2} color={'myGray.700'}>
          <MyIcon name={'common/errorFill'} w={'16px'} color={'red.500'} />
          <Text fontSize={'xs'} fontWeight={500}>
            {title}
          </Text>
        </HStack>
        <Button
          size={'xs'}
          variant={'whiteBase'}
          leftIcon={<MyIcon name={'copy'} w={'12px'} />}
          onClick={() => copyData(code)}
        >
          {t('common:Copy')}
        </Button>
      </Flex>
    </Box>
  );
};

export default React.memo(CodeBlockErrorCard);
