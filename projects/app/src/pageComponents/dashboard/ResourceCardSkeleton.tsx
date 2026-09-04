import { Box, Flex, Skeleton, SkeletonCircle } from '@chakra-ui/react';

const skeletonProps = {
  startColor: '#f4f4f5',
  endColor: '#e4e4e7',
  borderRadius: '2px'
};

/**
 * 资源列表首次加载和分页加载时使用的卡片占位，尺寸与真实卡片保持稳定以避免网格跳动。
 */
const ResourceCardSkeleton = () => (
  <Box
    data-virtual-item=""
    display="flex"
    flexDirection="column"
    h="146px"
    pt="16px"
    pb="14px"
    px="20px"
    border="1px solid"
    borderColor="myGray.200"
    borderRadius="10px"
    bg="white"
    overflow="hidden"
  >
    <Flex align="center" gap="8px" h="32px">
      <Skeleton {...skeletonProps} flexShrink={0} w="24px" h="24px" />
      <Skeleton {...skeletonProps} flex="1" h="16px" minW={0} />
      <Skeleton {...skeletonProps} flexShrink={0} w="55px" h="16px" />
    </Flex>
    <Skeleton {...skeletonProps} mt="12px" w="50%" h="16px" />
    <Flex mt="auto" align="center" gap="12px" h="24px">
      <Flex align="center" gap="6px" w="85px" flexShrink={0}>
        <SkeletonCircle
          size="20px"
          startColor={skeletonProps.startColor}
          endColor={skeletonProps.endColor}
        />
        <Skeleton {...skeletonProps} flex="1" h="16px" minW={0} />
      </Flex>
      <Skeleton {...skeletonProps} flexShrink={0} w="59px" h="16px" />
      <Skeleton {...skeletonProps} flex="1" h="16px" minW={0} />
    </Flex>
  </Box>
);

export default ResourceCardSkeleton;
