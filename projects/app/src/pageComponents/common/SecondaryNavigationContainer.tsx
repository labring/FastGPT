import { Box, Flex, Skeleton } from '@chakra-ui/react';
import type React from 'react';
import PageContainer from '@/components/PageContainer';
import SideTabsGroup from '@/components/SideTabs/Group';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

export type SecondaryNavigationTab<ValueType extends string> = {
  icon: string;
  label: string;
  value: ValueType;
  /** 分组子项：有 children 时渲染为可展开的分组父级，否则为单级项（兼容账号页） */
  children?: SecondaryNavigationTab<ValueType>[];
};

type SecondaryNavigationContainerProps<ValueType extends string> = {
  children: React.ReactNode;
  tabs: SecondaryNavigationTab<ValueType>[];
  value: ValueType;
  onChange: (value: ValueType) => void;
  mobileScrollPositionKey: string;
  isLoading?: boolean;
  /** tabs 依赖异步数据且尚未确定时置为 true：菜单渲染骨架，避免先渲染通用菜单再收缩导致的闪烁 */
  isMenuLoading?: boolean;
  footer?: React.ReactNode;
};

/** 菜单骨架占位行数：仅用于填充首屏侧栏，避免菜单数据到达前出现空白 */
const menuSkeletonRows = 6;

/** 沿用 ResourceCardSkeleton 的骨架配色，避免白底上占位块对比过强 */
const menuSkeletonProps = {
  startColor: '#f4f4f5',
  endColor: '#e4e4e7'
};

/**
 * 账号与管理员页面共用的二级导航壳层。
 * PC 使用固定侧栏，移动端使用可横向滚动的顶部导航，并把内容区作为统一滚动容器。
 */
const SecondaryNavigationContainer = <ValueType extends string>({
  children,
  tabs,
  value,
  onChange,
  mobileScrollPositionKey,
  isLoading,
  isMenuLoading,
  footer
}: SecondaryNavigationContainerProps<ValueType>) => {
  const { isPc } = useSystem();

  return (
    <PageContainer
      isLoading={isLoading}
      py={0}
      pr={0}
      insertProps={{
        borderWidth: 0,
        borderRadius: 0,
        boxShadow: 'none',
        bg: 'white',
        overflow: 'hidden'
      }}
    >
      <Flex flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
        {isPc ? (
          <Flex
            flexDirection={'column'}
            h={'100%'}
            flex={'0 0 220px'}
            borderRight={'1px solid'}
            borderColor={'myGray.200'}
            bg={'white'}
            minH={0}
          >
            {isMenuLoading ? (
              <Flex
                flexDirection={'column'}
                gap={2}
                flex={1}
                px={2.5}
                pt={4}
                w={'100%'}
                minH={0}
                overflowY={'hidden'}
              >
                {Array.from({ length: menuSkeletonRows }).map((_, index) => (
                  <Skeleton
                    key={index}
                    {...menuSkeletonProps}
                    flexShrink={0}
                    w={'100%'}
                    h={'36px'}
                    borderRadius={'md'}
                  />
                ))}
              </Flex>
            ) : (
              <SideTabsGroup<ValueType>
                flex={1}
                px={2.5}
                pt={4}
                w={'100%'}
                minH={0}
                overflowY={'auto'}
                list={tabs}
                scrollPositionKey={mobileScrollPositionKey}
                value={value}
                onChange={onChange}
              />
            )}
            {footer}
          </Flex>
        ) : (
          <Box mb={3}>
            {isMenuLoading ? (
              <Skeleton
                {...menuSkeletonProps}
                m={'auto'}
                w={'100%'}
                h={'34px'}
                borderRadius={'sm'}
              />
            ) : (
              <LightRowTabs<ValueType>
                m={'auto'}
                w={'100%'}
                size={'sm'}
                ensureActiveVisible
                scrollPositionKey={mobileScrollPositionKey}
                list={tabs
                  .flatMap((item) => (item.children?.length ? item.children : [item]))
                  .map((item) => ({
                    value: item.value,
                    label: item.label
                  }))}
                value={value}
                onChange={onChange}
              />
            )}
          </Box>
        )}

        <Box
          flex={'1 0 0'}
          minW={0}
          h={'100%'}
          pb={[4, 0]}
          overflow={['auto', 'hidden']}
          bg={'white'}
        >
          {children}
        </Box>
      </Flex>
    </PageContainer>
  );
};

export default SecondaryNavigationContainer;
