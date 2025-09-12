import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  HStack,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionIcon } from '@fastgpt/global/core/dataset/utils';
import { getDatasets } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getDatasetCollections } from '@/web/core/dataset/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import type { GetResourceListItemResponse } from '@fastgpt/global/common/parentFolder/type';
import { useMemoizedFn } from 'ahooks';

export interface FileSelection {
  datasetId?: string;
  datasetName?: string;
  datasetAvatar?: string;
  collectionId?: string;
  collectionName?: string;
  collectionType?: string;
  noKnowledgeBase?: boolean;
}

interface FilesCascaderProps {
  value?: FileSelection;
  onChange?: (selection: FileSelection) => void;
  placeholder?: string;
  width?: string | string[];
  isDisabled?: boolean;
}

/**
 * 知识库数据项类型
 */
type DatasetItemType = GetResourceListItemResponse & {
  open: boolean;
  children?: DatasetItemType[];
  type?: DatasetTypeEnum;
  vectorModel?: { name: string };
};

const FilesCascader: React.FC<FilesCascaderProps> = ({
  value,
  onChange,
  placeholder,
  width = '100%',
  isDisabled = false
}) => {
  const { t } = useTranslation();
  const ButtonRef = useRef<HTMLButtonElement>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  // 状态管理：选中的知识库ID、知识库列表、正在请求的ID列表
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [datasetList, setDatasetList] = useState<DatasetItemType[]>([]);
  const [requestingIdList, setRequestingIdList] = useState<string[]>([]);

  /**
   * 获取知识库列表
   * @param parentId 父级ID
   * @returns 知识库列表数据
   */
  const getDatasetList = useCallback(async ({ parentId }: { parentId: string | null }) => {
    return getDatasets({ parentId, searchKey: '' }).then((res) =>
      res.map<DatasetItemType>((item) => ({
        id: item._id,
        name: item.name,
        avatar: item.avatar,
        isFolder: item.type === DatasetTypeEnum.folder,
        type: item.type as DatasetTypeEnum,
        vectorModel: item.vectorModel,
        open: false
      }))
    );
  }, []);

  /**
   * 请求服务器获取数据
   */
  const { runAsync: requestServer } = useRequest2((e: { parentId: string | null }) => {
    if (requestingIdList.includes(e.parentId || '')) return Promise.reject(null);

    setRequestingIdList((state) => [...state, e.parentId || '']);
    return getDatasetList(e).finally(() =>
      setRequestingIdList((state) => state.filter((id) => id !== (e.parentId || '')))
    );
  }, {});

  /**
   * 初始化加载知识库列表
   */
  const { loading } = useRequest2(() => requestServer({ parentId: null }), {
    manual: false,
    onSuccess: (data) => {
      setDatasetList(data);
    }
  });

  /**
   * 获取选中知识库下的文件集合
   */
  const {
    data: collections = [],
    runAsync: loadCollections,
    loading: loadingCollections
  } = useRequest2(
    (datasetId: string) =>
      getDatasetCollections({
        datasetId: datasetId,
        parentId: '',
        selectFolder: false,
        simple: true,
        pageNum: 1,
        pageSize: 50
      }).then((res) => res.list || []),
    {
      manual: true
    }
  );

  /**
   * 格式化集合数据，添加图标
   */
  const formatCollections = useMemo(
    () =>
      collections.map((collection) => {
        const icon = getCollectionIcon({ type: collection.type, name: collection.name });
        return {
          ...collection,
          icon
        };
      }),
    [collections]
  );

  /**
   * 处理知识库选择
   * @param dataset 选中的知识库
   */
  const handleDatasetSelect = useCallback(
    async (dataset: DatasetItemType) => {
      if (dataset.isFolder) {
        // 如果是文件夹，展开或收起
        if (!dataset.children) {
          const data = await requestServer({ parentId: dataset.id });
          dataset.children = data;
        }
        dataset.open = !dataset.open;
        setDatasetList([...datasetList]);
      } else {
        // 如果是知识库，设置为选中状态并加载文件
        setSelectedDatasetId(dataset.id);
        const tempSelectionData = {
          datasetId: dataset.id,
          datasetName: dataset.name,
          datasetAvatar: dataset.avatar,
          collectionId: undefined,
          collectionName: undefined,
          collectionType: undefined,
          noKnowledgeBase: false
        };
        // 立即更新选择器的显示
        onChange?.(tempSelectionData);
        await loadCollections(dataset.id);
      }
    },
    [datasetList, requestServer, loadCollections, onChange]
  );

  /**
   * 处理文件选择
   * @param collection 选中的文件集合
   */
  const handleCollectionSelect = useCallback(
    (collection: any) => {
      // 在知识库列表中查找知识库名称和头像
      const findDatasetInfo = (
        list: DatasetItemType[],
        id: string
      ): { name?: string; avatar?: string } | undefined => {
        for (const item of list) {
          if (item.id === id) return { name: item.name, avatar: item.avatar };
          if (item.children) {
            const found = findDatasetInfo(item.children, id);
            if (found) return found;
          }
        }
        return undefined;
      };

      const datasetInfo = findDatasetInfo(datasetList, selectedDatasetId);
      const newSelection = {
        datasetId: selectedDatasetId,
        datasetName: datasetInfo?.name,
        datasetAvatar: datasetInfo?.avatar,
        collectionId: collection._id,
        collectionName: collection.name,
        collectionType: collection.type,
        noKnowledgeBase: false
      };
      onChange?.(newSelection);
      onClose();
    },
    [selectedDatasetId, datasetList, onChange, onClose]
  );

  /**
   * 处理"不加入知识库"选择
   */
  const handleNoKnowledgeBase = useCallback(() => {
    setSelectedDatasetId('');
    const newSelection = {
      datasetId: undefined,
      datasetName: undefined,
      collectionId: undefined,
      collectionName: undefined,
      collectionType: undefined,
      noKnowledgeBase: true
    };
    onChange?.(newSelection);
    onClose();
  }, [onChange, onClose]);

  /**
   * 获取知识库头像
   */
  const getDatasetAvatar = useCallback(
    (datasetId: string): string | undefined => {
      const findDatasetAvatar = (list: DatasetItemType[], id: string): string | undefined => {
        for (const item of list) {
          if (item.id === id) return item.avatar;
          if (item.children) {
            const found = findDatasetAvatar(item.children, id);
            if (found) return found;
          }
        }
        return undefined;
      };
      return findDatasetAvatar(datasetList, datasetId);
    },
    [datasetList]
  );

  /**
   * 渲染显示内容
   */
  const renderDisplayContent = useMemo(() => {
    if (value?.noKnowledgeBase) {
      return (
        <Text color="myGray.700" noOfLines={1}>
          {t('app:files_cascader_no_knowledge_base')}
        </Text>
      );
    }

    if (value?.datasetName && value?.collectionName) {
      // 显示完整路径：知识库图标 + 知识库名称 + 箭头 + 文件图标 + 文件名称
      const datasetAvatar =
        value.datasetAvatar || (value.datasetId ? getDatasetAvatar(value.datasetId) : undefined);
      const collectionIcon = getCollectionIcon({
        type: value.collectionType as any,
        name: value.collectionName
      });

      return (
        <Flex alignItems="center" flex={1} minW={0}>
          {datasetAvatar && (
            <Avatar src={datasetAvatar} w="1rem" h="1rem" borderRadius="sm" mr={1} />
          )}
          <Text color="myGray.700" noOfLines={1} mr={1}>
            {value.datasetName}
          </Text>
          <MyIcon name="common/rightArrowFill" w="12px" h="12px" color="myGray.400" mx={1} />
          {collectionIcon && (
            <Avatar src={collectionIcon as any} w="1rem" h="1rem" borderRadius="sm" mr={1} />
          )}
          <Text color="myGray.700" noOfLines={1}>
            {value.collectionName}
          </Text>
        </Flex>
      );
    }

    if (value?.datasetName) {
      const datasetAvatar =
        value.datasetAvatar || (value.datasetId ? getDatasetAvatar(value.datasetId) : undefined);
      return (
        <Flex alignItems="center">
          {datasetAvatar && (
            <Avatar src={datasetAvatar} w="1rem" h="1rem" borderRadius="sm" mr={2} />
          )}
          <Text color="myGray.700" noOfLines={1}>
            {value.datasetName}
          </Text>
        </Flex>
      );
    }

    return (
      <Text color="myGray.400" noOfLines={1}>
        {placeholder || t('app:files_cascader_select_knowledge_base')}
      </Text>
    );
  }, [value, placeholder, t, getDatasetAvatar]);

  /**
   * 渲染知识库树形结构
   */
  const renderDatasetTree = useMemoizedFn(
    ({ list, index = 0 }: { list: DatasetItemType[]; index?: number }) => {
      return (
        <>
          {list.map((item) => (
            <Box key={item.id} _notLast={{ mb: 0.5 }} userSelect={'none'}>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={1}
                pl={index === 0 ? '0.5rem' : `${1.75 * index + 0.5}rem`}
                pr={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myGray.100'
                }}
                bg={selectedDatasetId === item.id ? 'primary.50' : 'transparent'}
                onClick={() => handleDatasetSelect(item)}
              >
                {item.isFolder && (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    w={'1.25rem'}
                    h={'1.25rem'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    _hover={{
                      bg: 'rgba(31, 35, 41, 0.08)'
                    }}
                  >
                    <MyIcon
                      name={
                        requestingIdList.includes(item.id)
                          ? 'common/loading'
                          : 'common/rightArrowFill'
                      }
                      w={'14px'}
                      color={'myGray.500'}
                      transform={item.open ? 'rotate(90deg)' : 'none'}
                    />
                  </Flex>
                )}
                <Avatar
                  ml={item.isFolder ? '0.5rem' : 0}
                  src={item.avatar}
                  w={'1.25rem'}
                  h={'1.25rem'}
                  borderRadius={'sm'}
                />
                <Text fontSize={'sm'} ml={2} noOfLines={1} flex={1}>
                  {item.name}
                </Text>
              </Flex>
              {item.children && item.open && (
                <Box mt={0.5}>{renderDatasetTree({ list: item.children, index: index + 1 })}</Box>
              )}
            </Box>
          ))}
        </>
      );
    }
  );

  return (
    <Box>
      <Menu autoSelect={false} isOpen={isOpen} onOpen={onOpen} onClose={onClose} strategy={'fixed'}>
        <MenuButton
          as={Button}
          ref={ButtonRef}
          width={width}
          px={3}
          rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} color={'myGray.500'} />}
          variant={'whitePrimaryOutline'}
          size={'md'}
          fontSize={'sm'}
          textAlign={'left'}
          h={'auto'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-word'}
          transition={'border-color 0.1s ease-in-out, box-shadow 0.1s ease-in-out'}
          isDisabled={isDisabled}
          _active={{
            transform: 'none'
          }}
          bg={isOpen ? '#fff' : '#fff'}
          color={isOpen ? 'primary.700' : 'myGray.700'}
          borderColor={isOpen ? 'primary.300' : 'myGray.200'}
          boxShadow={isOpen ? '0px 0px 0px 2.4px rgba(51, 112, 255, 0.15)' : 'none'}
          _hover={{ borderColor: 'primary.300' }}
        >
          <Flex alignItems={'center'} justifyContent="space-between" w="100%" minW={0}>
            <Flex alignItems={'center'} flex={1} minW={0}>
              {loading && <MyIcon mr={2} name={'common/loading'} w={'1rem'} />}
              {renderDisplayContent}
            </Flex>
          </Flex>
        </MenuButton>

        <MenuList
          w={(() => {
            const w = ButtonRef.current?.clientWidth;
            if (w) {
              return `${Math.max(w, 500)}px !important`;
            }
            return '500px !important';
          })()}
          px={'0'}
          py={'0'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 2px 4px rgba(161, 167, 179, 0.25), 0px 0px 1px rgba(121, 141, 159, 0.25);'
          }
          zIndex={99}
          h={'300px'}
          overflow={'hidden'}
        >
          <Flex h={'100%'}>
            {/* 左侧知识库列表 */}
            <MyBox
              isLoading={loading}
              flex={1}
              maxH="400px"
              overflowY="auto"
              borderRight="1px solid"
              borderColor="myGray.100"
              px={'6px'}
              py={'6px'}
            >
              <VStack align="stretch" spacing={0}>
                {/* 不加入知识库选项 */}
                {!loading && (
                  <Box
                    px={2}
                    py={1}
                    cursor="pointer"
                    borderRadius={'md'}
                    _hover={{ bg: 'myGray.100' }}
                    onClick={handleNoKnowledgeBase}
                    bg={value?.noKnowledgeBase ? 'primary.50' : 'transparent'}
                    mb={1}
                  >
                    <Text fontSize="sm" color="myGray.700">
                      {t('app:files_cascader_no_knowledge_base')}
                    </Text>
                  </Box>
                )}

                {/* 知识库列表 */}
                {datasetList.length !== 0 && <Box>{renderDatasetTree({ list: datasetList })}</Box>}
              </VStack>
            </MyBox>

            {/* 右侧文件列表 */}
            <MyBox
              isLoading={loadingCollections}
              flex={1}
              h="300px"
              overflowY="auto"
              px={'6px'}
              py={'6px'}
            >
              <VStack align="stretch" spacing={0}>
                {!selectedDatasetId || value?.noKnowledgeBase ? (
                  <Box px={2} py={2}>
                    <Text fontSize="sm" color="myGray.400" textAlign="center">
                      {t('app:files_cascader_select_first')}
                    </Text>
                  </Box>
                ) : formatCollections.length === 0 && !loadingCollections ? (
                  <Box px={2} py={2}>
                    <Text fontSize="sm" color="myGray.400" textAlign="center">
                      {t('app:files_cascader_dataset_empty')}
                    </Text>
                  </Box>
                ) : (
                  formatCollections.map((collection) => (
                    <Box
                      key={collection._id}
                      px={2}
                      py={1}
                      cursor="pointer"
                      borderRadius={'md'}
                      _hover={{ bg: 'myGray.100' }}
                      bg={value?.collectionId === collection._id ? 'primary.50' : 'transparent'}
                      onClick={() => handleCollectionSelect(collection)}
                      mb={0.5}
                    >
                      <HStack spacing={2}>
                        <MyIcon name={collection.icon as any} w="16px" h="16px" />
                        <Text fontSize="sm" noOfLines={1} flex={1}>
                          {collection.name}
                        </Text>
                      </HStack>
                    </Box>
                  ))
                )}
              </VStack>
            </MyBox>
          </Flex>
        </MenuList>
      </Menu>
    </Box>
  );
};

export default React.memo(FilesCascader);
