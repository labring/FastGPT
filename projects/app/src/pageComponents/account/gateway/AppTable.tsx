import {
  Box,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Tag,
  Text,
  Center,
  IconButton,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getMyApps, delAppById } from '@/web/core/app/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import type { AppListItemType } from '@fastgpt/global/core/app/type.d';
import { getTeamTags } from '@/web/core/app/api/tags';
import type { TagSchemaType } from '@fastgpt/global/core/app/tags';
import GateAppInfoModal from './GateAppInfoModal';
import TagManageModal from './TagManageModal';
const MyModal = dynamic(() => import('@fastgpt/web/components/common/MyModal'));
const ModelEditModal = dynamic(() =>
  import('../model/AddModelBox').then((mod) => mod.ModelEditModal)
);

// 复用 TagManageModal 中的颜色选项
const colorOptions: { value: string; color: string; bg: string }[] = [
  { value: 'blue', color: 'blue.600', bg: 'blue.50' },
  { value: 'green', color: 'green.600', bg: 'green.50' },
  { value: 'red', color: 'red.600', bg: 'red.50' },
  { value: 'yellow', color: 'yellow.600', bg: 'yellow.50' },
  { value: 'purple', color: 'purple.600', bg: 'purple.50' },
  { value: 'teal', color: 'teal.600', bg: 'teal.50' }
];

// 获取标签样式
const getTagStyle = (color: string) => {
  // 处理预设颜色
  const preset = colorOptions.find((opt) => opt.value === color);
  if (preset) {
    return {
      colorScheme: color,
      bg: preset.bg,
      color: preset.color
    };
  }
  // 处理自定义颜色 (#XXXXXX)
  if (color.startsWith('#')) {
    return {
      bg: `${color}15`, // 15 表示透明度
      color: color
    };
  }
  // 默认返回蓝色
  return {
    colorScheme: 'blue',
    bg: 'blue.50',
    color: 'blue.600'
  };
};

// 添加 AppNameDisplay 组件
const AppNameDisplay = ({ app }: { app: AppListItemType }) => {
  return (
    <Flex alignItems="center" width="100%" transition="all 0.2s">
      <Flex
        w={'20px'}
        h={'20px'}
        borderRadius={'4px'}
        overflow="hidden"
        position="relative"
        display="flex"
        justifyContent="center"
        alignItems="center"
        bg={app.avatar ? 'transparent' : 'blue.50'}
        boxShadow="sm"
      >
        {app.avatar ? (
          <Avatar src={app.avatar} alt={app.name} objectFit="cover" w="100%" h="100%" />
        ) : (
          <Text color="blue.500" fontSize="16px" fontWeight="bold">
            {app.name.charAt(0).toUpperCase()}
          </Text>
        )}
      </Flex>
      <Box
        ml={3}
        className={'textEllipsis'}
        fontSize={'md'}
        fontWeight="medium"
        color={'myGray.900'}
        flex="1"
        noOfLines={1}
      >
        {app.name}
      </Box>
    </Flex>
  );
};

const AppTable = () => {
  const { t } = useTranslation();
  const [editingApp, setEditingApp] = useState<AppListItemType | null>(null);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const {
    isOpen: isTagModalOpen,
    onOpen: onOpenTagModal,
    onClose: onCloseTagModal
  } = useDisclosure();

  // 获取应用列表
  const {
    data: appList = [],
    loading: loadingApps,
    refresh: refreshApps
  } = useRequest2(() => getMyApps(), {
    manual: false
  });

  // 获取标签列表
  const { data: tagList = [], loading: loadingTags } = useRequest2(() => getTeamTags(), {
    manual: false
  });

  // 创建标签映射
  const tagMap = useMemo(() => {
    const map = new Map<string, TagSchemaType>();
    (tagList as TagSchemaType[]).forEach((tag) => {
      map.set(tag._id, tag);
    });
    return map;
  }, [tagList]);

  // add confirm hook for delete
  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  // add delete function
  const { runAsync: onclickDelApp } = useRequest2(delAppById, {
    onSuccess() {
      refreshApps();
    },
    successToast: t('common:delete_success'),
    errorToast: t('common:delete_failed')
  });

  const loading = loadingApps || loadingTags;

  // Filter apps based on search and selected tag
  const filteredApps = useMemo(() => {
    return appList.filter((app) => {
      const searchFilter = search
        ? app.name.toLowerCase().includes(search.toLowerCase()) ||
          app.intro?.toLowerCase().includes(search.toLowerCase())
        : true;

      const tagFilter = selectedTag ? app.tags?.includes(selectedTag) : true;

      return searchFilter && tagFilter;
    });
  }, [appList, search, selectedTag]);

  // Get unique tags from all apps
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    appList.forEach((app) => {
      app.tags?.forEach((tag) => tags.add(tag));
    });
    return [
      { label: t('common:All'), value: '' },
      ...Array.from(tags).map((tag) => ({
        label: tagMap.get(tag)?.name || tag,
        value: tag
      }))
    ];
  }, [appList, t, tagMap]);

  return (
    <MyBox flex={'1 0 0'} isLoading={loading}>
      <Flex flexDirection={'column'} h={'100%'}>
        {/* Add filter controls */}
        <Flex
          gap={4}
          mb={4}
          flexDirection={{ base: 'column', md: 'row' }}
          alignItems={{ base: 'stretch', md: 'center' }}
        >
          <Flex flex={1} gap={4}>
            <Box flex={'1 0 0'}>
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('app:search_app')}
              />
            </Box>
            <Box w={'200px'}>
              <MySelect
                value={selectedTag}
                onChange={setSelectedTag}
                list={allTags}
                placeholder={t('common:select_tag')}
              />
            </Box>
          </Flex>
          <Button
            variant="outline"
            leftIcon={<MyIcon name="common/settingLight" w="14px" />}
            onClick={onOpenTagModal}
            minW={'120px'}
          >
            {t('common:tag_manage')}
          </Button>
        </Flex>

        <TableContainer
          mt={2}
          flex={'1 0 0'}
          h={0}
          overflowY={'auto'}
          borderRadius="lg"
          boxShadow="none"
          border="none"
        >
          <Table variant="simple">
            <Thead bg="gray.50">
              <Tr>
                <Th py={4} borderBottom="2px" borderColor="gray.200">
                  {t('common:Name')}
                </Th>
                <Th py={4} borderBottom="2px" borderColor="gray.200">
                  {t('common:Intro')}
                </Th>
                <Th py={4} borderBottom="2px" borderColor="gray.200">
                  {t('common:Tags')}
                </Th>
                <Th py={4} borderBottom="2px" borderColor="gray.200">
                  {t('common:Action')}
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredApps.length === 0 ? (
                <Tr>
                  <Td colSpan={4}>
                    <Center py={8}>
                      <Text color="gray.500">
                        {loading ? t('common:Loading') : t('common:no_matching_apps_found')}
                      </Text>
                    </Center>
                  </Td>
                </Tr>
              ) : (
                filteredApps.map((app: AppListItemType) => (
                  <Tr
                    borderBottom="1px solid #F0F1F6"
                    key={app._id}
                    _hover={{
                      transform: 'translateY(-2px)',
                      boxShadow: '0px 8px 16px rgba(19, 51, 107, 0.1)',
                      background: '#FFF',
                      transition: 'all 0.2s ease-in-out',
                      position: 'relative',
                      zIndex: 1
                    }}
                    borderRadius="10px"
                    overflow="hidden"
                    cursor="pointer"
                  >
                    <Td py={4} borderBottomWidth="0">
                      <AppNameDisplay app={app} />
                    </Td>
                    <Td py={4} borderBottomWidth="0">
                      <Box color="myGray.500" noOfLines={2}>
                        {app.intro}
                      </Box>
                    </Td>
                    <Td py={4} borderBottomWidth="0">
                      <HStack spacing={2} wrap="wrap">
                        {app.tags?.map((tagId) => {
                          const tag = tagMap.get(tagId);
                          if (!tag) return null;
                          return (
                            <Tag
                              key={tag._id}
                              size="md"
                              variant="subtle"
                              {...getTagStyle(tag.color)}
                              px={3}
                              py={1.5}
                              borderRadius="full"
                            >
                              {tag.name}
                            </Tag>
                          );
                        })}
                      </HStack>
                    </Td>
                    <Td py={4} borderBottomWidth="0">
                      <HStack spacing={2}>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          icon={<MyIcon name={'edit'} w={'14px'} />}
                          aria-label="edit"
                          onClick={() => setEditingApp(app)}
                        />
                        <IconButton
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          icon={<MyIcon name={'delete'} w={'14px'} />}
                          aria-label="delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            openConfirmDel(() => onclickDelApp(app._id))();
                          }}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </TableContainer>

        {/* Modals */}
        {editingApp && (
          <GateAppInfoModal
            app={editingApp}
            onClose={() => setEditingApp(null)}
            onUpdateSuccess={refreshApps}
          />
        )}
        {isTagModalOpen && <TagManageModal onClose={onCloseTagModal} />}
        <DelConfirmModal />
      </Flex>
    </MyBox>
  );
};

export default AppTable;
