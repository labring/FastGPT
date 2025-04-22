import { Flex, Box, Heading } from '@chakra-ui/react';

export default function SectionHeader({ title }: { title: string }) {
  return (
    <Flex alignItems="center">
      <Box
        bg="blue.500" // 设置背景颜色为蓝色
        w="4px" // 设置宽度
        h="24px" // 设置高度（可以根据字体大小调整）
        borderRadius="full" // 设置圆角
        mr={3} // 设置右边距
      />
      <Heading size="md"> {title}</Heading>
    </Flex>
  );
}
