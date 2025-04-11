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
import { AppGroupEnum, AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';
import { useContextSelector } from 'use-context-selector';
import { StudioContext } from '../context';

interface SidebarProps {
  groupList: {
    groupId: string;
    groupAvatar: string;
    groupName: any;
  }[];
  groupItems: Record<AppGroupEnum, { typeId: string; typeName: string }[]>;
  onCloseSidebar: () => void;
  setSidebarWidth?: (width: number) => void;
  isLoading?: boolean;
}

const Sidebar = ({
  groupList,
  groupItems,
  onCloseSidebar,
  setSidebarWidth,
  isLoading
}: SidebarProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();
  const { pluginGroups } = useContextSelector(StudioContext, (v) => v);

  const {
    selectedGroup,
    pluginGroupId,
    selectedType = 'all'
  } = useMemo(() => {
    return {
      selectedGroup: router.pathname.split('/').pop() as AppGroupEnum,
      pluginGroupId: router.query.groupId,
      selectedType: router.query.type
    };
  }, [router.pathname, router.query.groupId, router.query.type]);

  const {
    width: sidebarWidth,
    isDragging,
    handleMouseDown
  } = useResizable({
    initialWidth: 240,
    minWidth: 200,
    maxWidth: 320
  });

  useEffect(() => {
    setSidebarWidth?.(sidebarWidth);
  }, [sidebarWidth, setSidebarWidth]);

  const handleTypeClick = (typeId: string, defaultAction: () => void) => {
    if (
      selectedGroup === AppGroupEnum.templateMarket &&
      typeId !== AppTemplateTypeEnum.contribute
    ) {
      defaultAction();

      setTimeout(() => {
        const element = document.getElementById(typeId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      defaultAction();
    }
  };

  const handleGroupClick = (group: (typeof groupList)[0]) => {
    const isPluginGroup = pluginGroups.find((item) => item.groupId === group.groupId);
    const pathname = isPluginGroup ? '/app/systemPlugin' : `/app/${group.groupId}`;
    const defaultType =
      group.groupId === AppGroupEnum.templateMarket
        ? AppTemplateTypeEnum.recommendation
        : groupItems[group.groupId as AppGroupEnum]?.[0]?.typeId;

    const query: Record<string, string> = {
      type: defaultType
    };

    // Add groupId only for non-system plugin groups
    if (isPluginGroup && group.groupId !== AppGroupEnum.systemPlugin) {
      query.groupId = group.groupId;
    }

    router.replace({
      pathname,
      query
    });

    onCloseSidebar();
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
        const selected =
          (group.groupId === selectedGroup && !pluginGroupId) || pluginGroupId === group.groupId;
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
              onClick={() => handleGroupClick(group)}
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
              groupItems[(pluginGroupId ? pluginGroupId : selectedGroup) as AppGroupEnum].map(
                (type) => {
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
                          if (type.typeId === AppTemplateTypeEnum.contribute) {
                            window.open(feConfigs?.appTemplateCourse);
                          } else {
                            router.push({
                              query: {
                                ...(pluginGroupId && { groupId: pluginGroupId }),
                                type: type.typeId
                              }
                            });
                            onCloseSidebar();
                          }
                        });
                      }}
                    >
                      {t(type.typeName as any)}
                    </Flex>
                  );
                }
              )}
          </Box>
        );
      })}
    </MyBox>
  );
};

export default React.memo(Sidebar);
