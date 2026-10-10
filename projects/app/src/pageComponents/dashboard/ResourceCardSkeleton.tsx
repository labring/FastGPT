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
    h="138px"
    py={3}
    px={5}
    border="1px solid"
    borderColor="myGray.200"
    borderRadius="10px"
    bg="white"
    overflow="hidden"
  >
    <Flex align="center" gap={2} h={8}>
      <Skeleton {...skeletonProps} flexShrink={0} w={6} h={6} />
      <Skeleton {...skeletonProps} flex={1} h={4} minW={0} />
      <Skeleton {...skeletonProps} flexShrink={0} w="55px" h={4} />
    </Flex>
    <Skeleton {...skeletonProps} mt={3} w="50%" h={4} />
    <Flex mt="auto" align="center" gap={3} h={6}>
      <Flex align="center" gap={1.5} w="85px" flexShrink={0}>
        <SkeletonCircle
          size="20px"
          startColor={skeletonProps.startColor}
          endColor={skeletonProps.endColor}
        />
        <Skeleton {...skeletonProps} flex={1} h={4} minW={0} />
      </Flex>
      <Skeleton {...skeletonProps} flexShrink={0} w="59px" h={4} />
      <Skeleton {...skeletonProps} flex={1} h={4} minW={0} />
    </Flex>
  </Box>
);

export default ResourceCardSkeleton;
