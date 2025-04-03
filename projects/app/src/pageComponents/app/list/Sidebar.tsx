import React, { useEffect, useMemo } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useResizable } from '@fastgpt/web/hooks/useResizable';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { navbarWidth } from '@/components/Layout';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyBox from '@fastgpt/web/components/common/MyBox';

export type GroupType = 'teamApp' | 'templateMarket' | string;

interface SidebarProps {
  groupList: {
    groupId: string;
    groupAvatar: string;
    groupName: any;
  }[];
  groupItems: Record<GroupType, { typeId: string; typeName: string }[]>;
  selectedGroup?: string;
  selectedType?: string;
  onCloseSidebar: () => void;
  setSidebarWidth?: (width: number) => void;
  isLoading?: boolean;
}

const Sidebar = ({
  groupList,
  groupItems,
  selectedGroup = 'teamApp',
  selectedType = 'all',
  onCloseSidebar,
  setSidebarWidth,
  isLoading
}: SidebarProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  const {
    width: sidebarWidth,
    isDragging,
    handleMouseDown
  } = useResizable({
    initialWidth: 300,
    minWidth: 200,
    maxWidth: 400
  });

  useEffect(() => {
    setSidebarWidth?.(sidebarWidth);
  }, [sidebarWidth, setSidebarWidth]);

  // 点击标签时滚动到对应位置的辅助函数
  const handleTypeClick = (typeId: string, defaultAction: () => void) => {
    // 如果是模板市场，且点击的不是contribute类型（它会打开外部链接）
    if (selectedGroup === 'templateMarket' && typeId !== 'contribute') {
      // 先执行默认操作（更新URL等）
      defaultAction();

      // 然后滚动到对应位置
      setTimeout(() => {
        const element = document.getElementById(typeId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100); // 短暂延迟确保DOM已更新
    } else {
      // 对于其他情况，只执行默认操作
      defaultAction();
    }
  };

  return (
    <MyBox
      isLoading={isLoading}
      position={'fixed'}
      left={isPc ? navbarWidth : 0}
      top={0}
      bg={'myGray.25'}
      w={`${sidebarWidth}px`}
      h={'full'}
      borderLeft={'1px solid'}
      borderRight={'1px solid'}
      borderColor={'myGray.200'}
      pt={4}
      px={2.5}
      pb={2.5}
      zIndex={100}
      userSelect={'none'}
      transition={isDragging ? 'none' : 'width 0.2s'}
    >
      <Box
        position="absolute"
        right={0}
        top={0}
        bottom={0}
        w="4px"
        cursor="ew-resize"
        bg="transparent"
        _hover={{ bg: 'primary.200' }}
        onMouseDown={handleMouseDown}
        zIndex={101}
      />
      {groupList.map((group) => {
        const selected = group.groupId === selectedGroup;
        return (
          <Box key={group.groupId}>
            <Flex
              p={2}
              mb={0.5}
              fontSize={'sm'}
              rounded={'md'}
              color={'myGray.900'}
              cursor={'pointer'}
              _hover={{
                bg: 'primary.50'
              }}
              onClick={() => {
                router.push({
                  query: {
                    group: group.groupId,
                    type: groupItems[group.groupId as GroupType]?.[0]?.typeId
                  }
                });
                onCloseSidebar();
              }}
            >
              <Avatar src={group.groupAvatar} w={'1rem'} mr={1.5} color={'myGray.500'} />
              <Box color={'myGray.600'} fontWeight={'medium'}>
                {t(group.groupName as any)}
              </Box>
              <Box flex={1} />
              <MyIcon
                color={'myGray.600'}
                name={selected ? 'core/chat/chevronDown' : 'core/chat/chevronUp'}
                w={'1rem'}
              />
            </Flex>
            {selected &&
              groupItems[selectedGroup as GroupType].map((type) => {
                const isActive = type.typeId === selectedType;

                return (
                  <Flex
                    key={type.typeId}
                    fontSize={'14px'}
                    fontWeight={500}
                    rounded={'md'}
                    py={2}
                    pl={'30px'}
                    cursor={'pointer'}
                    mb={0.5}
                    _hover={{ bg: 'primary.50' }}
                    {...(isActive
                      ? {
                          bg: 'primary.50',
                          color: 'primary.600'
                        }
                      : {
                          bg: 'transparent',
                          color: 'myGray.500'
                        })}
                    onClick={() => {
                      handleTypeClick(type.typeId, () => {
                        if (type.typeId === 'contribute') {
                          window.open(feConfigs?.appTemplateCourse);
                        } else {
                          router.push({
                            query: { group: selectedGroup, type: type.typeId }
                          });
                          onCloseSidebar();
                        }
                      });
                    }}
                  >
                    {t(type.typeName as any)}
                  </Flex>
                );
              })}
          </Box>
        );
      })}
    </MyBox>
  );
};

export default React.memo(Sidebar);
