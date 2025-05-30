import React, { useCallback, useState } from 'react';
import { ModalBody, ModalFooter, Button, Text, Flex, Box, IconButton } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import type { SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import { useTranslation } from 'next-i18next';
import SelectMultipleResource from './SelectMultipleResource';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DndDrag, { Draggable } from '@fastgpt/web/components/common/DndDrag';
import {
  type GetResourceFolderListProps,
  type GetResourceListItemResponse
} from '@fastgpt/global/common/parentFolder/type';
import { getMyApps } from '@/web/core/app/api';
import { listFeatureApps, batchUpdateFeaturedApps } from '@/web/support/user/team/gate/featureApp';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

// 扩展的应用类型，包含显示所需的属性
type ExtendedSelectAppItemType = SelectAppItemType & {
  name: string;
  avatar?: string;
};

const AddFeatureAppModal = ({
  isOpen = true,
  value,
  filterAppIds = [],
  onClose,
  onSuccess
}: {
  isOpen?: boolean;
  value?: ExtendedSelectAppItemType[];
  filterAppIds?: string[];
  onClose: () => void;
  onSuccess: (e: ExtendedSelectAppItemType[]) => void;
}) => {
  const { t } = useTranslation();
  const [selectedApps, setSelectedApps] = useState<ExtendedSelectAppItemType[]>([]);
  const [searchKey, setSearchKey] = useState('');

  // 使用 listFeatureApps 初始化已选择的应用数组
  const { data: featureApps = [], loading: loadingFeatureApps } = useRequest2(
    () => listFeatureApps(),
    {
      manual: false,
      onSuccess: (data) => {
        const initialSelectedApps = data.map((app) => ({
          id: app._id,
          name: app.name,
          avatar: app.avatar
        }));
        setSelectedApps(initialSelectedApps);
      }
    }
  );

  const getAppList = useCallback(
    async ({ parentId }: GetResourceFolderListProps) => {
      return getMyApps({
        parentId,
        searchKey,
        type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
      }).then((res) =>
        res
          .filter((item) => !filterAppIds.includes(item._id))
          .map<GetResourceListItemResponse>((item) => ({
            id: item._id,
            name: item.name,
            avatar: item.avatar,
            isFolder: item.type === AppTypeEnum.folder
          }))
      );
    },
    [filterAppIds, searchKey]
  );

  const handleAppSelect = useCallback((appId: string, appData: GetResourceListItemResponse) => {
    setSelectedApps((prev) => {
      const exists = prev.find((app) => app.id === appId);
      if (exists) {
        // 如果已存在，则移除
        return prev.filter((app) => app.id !== appId);
      } else {
        // 如果不存在，则添加到末尾
        return [...prev, { id: appId, name: appData.name, avatar: appData.avatar }];
      }
    });
  }, []);

  const handleAppUnselect = useCallback((appId: string) => {
    setSelectedApps((prev) => prev.filter((app) => app.id !== appId));
  }, []);

  // 处理拖拽排序
  const handleDragEnd = useCallback((reorderedList: ExtendedSelectAppItemType[]) => {
    setSelectedApps(reorderedList);
  }, []);

  // 批量更新特色应用
  const { runAsync: updateFeaturedApps, loading: isUpdating } = useRequest2(
    () => {
      const updates = [{ featuredApps: selectedApps.map((app) => app.id) }];
      return batchUpdateFeaturedApps(updates);
    },
    {
      manual: true,
      onSuccess: () => {
        onSuccess(selectedApps);
        onClose();
      },
      onError: (error) => {
        console.error('更新特色应用失败:', error);
      }
    }
  );

  return (
    <MyModal
      isOpen={isOpen}
      title={t('common:core.module.Select app')}
      iconSrc="/imgs/workflow/ai.svg"
      onClose={onClose}
      position={'relative'}
      w={'900px'}
      maxW={'90vw'}
    >
      <ModalBody flex={'1 0 0'} overflow={'hidden'} minH={'500px'} position={'relative'}>
        <Flex h="100%" gap={4}>
          {/* 左侧应用选择区域 */}
          <Flex direction="column" flex={1} h="100%">
            {/* 搜索框 */}
            <Box mb={4}>
              <SearchInput
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('app:search_app')}
              />
            </Box>

            {/* 应用选择区域 */}
            <Box flex={1} overflow="auto">
              <SelectMultipleResource
                selectedIds={selectedApps.map((app) => app.id)}
                onSelect={handleAppSelect}
                server={getAppList}
                searchKey={searchKey}
              />
            </Box>
          </Flex>

          {/* 右侧已选择应用排序区域 */}
          <Box w="300px" h="100%" borderLeft="1px solid" borderColor="gray.200" pl={4}>
            <Flex direction="column" h="100%">
              <Text fontSize="sm" fontWeight="medium" mb={3}>
                {t('common:selected')} {selectedApps.length}
              </Text>

              {selectedApps.length > 0 ? (
                <Box flex={1} overflow="auto">
                  <DndDrag<ExtendedSelectAppItemType>
                    onDragEndCb={handleDragEnd}
                    dataList={selectedApps}
                  >
                    {({ provided }) => (
                      <Flex
                        flexDirection={'column'}
                        gap={2}
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                      >
                        {selectedApps.map((app, index) => (
                          <Draggable key={app.id} draggableId={String(app.id)} index={index}>
                            {(provided, snapshot) => (
                              <Flex
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                style={{
                                  ...provided.draggableProps.style,
                                  opacity: snapshot.isDragging ? 0.8 : 1
                                }}
                                alignItems="center"
                                gap={2}
                                p={2}
                                bg="white"
                                borderRadius="md"
                                border="1px solid"
                                borderColor="gray.200"
                                fontSize="sm"
                                _hover={{
                                  bg: 'gray.50',
                                  borderColor: 'gray.300'
                                }}
                              >
                                {/* 拖拽图标 */}
                                <Flex
                                  {...provided.dragHandleProps}
                                  alignItems="center"
                                  justifyContent="center"
                                  w="16px"
                                  h="16px"
                                  cursor="grab"
                                  _active={{ cursor: 'grabbing' }}
                                >
                                  <MyIcon name="drag" w={'10px'} h={'12px'} color={'gray.500'} />
                                </Flex>

                                {/* 应用图标 */}
                                <Avatar src={app.avatar} w="20px" h="20px" borderRadius="4px" />

                                {/* 应用名称 */}
                                <Text flex={1} fontSize="12px" fontWeight="500" noOfLines={1}>
                                  {app.name}
                                </Text>

                                {/* 删除按钮 */}
                                <IconButton
                                  size="xs"
                                  variant="ghost"
                                  icon={<MyIcon name="delete" w="12px" />}
                                  aria-label="remove"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAppUnselect(app.id);
                                  }}
                                  _hover={{ bg: 'red.50', color: 'red.500' }}
                                />
                              </Flex>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </Flex>
                    )}
                  </DndDrag>
                </Box>
              ) : (
                <Flex
                  flex={1}
                  alignItems="center"
                  justifyContent="center"
                  color="gray.500"
                  fontSize="sm"
                >
                  <Text>{t('common:no_selected_apps')}</Text>
                </Flex>
              )}
            </Flex>
          </Box>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          ml={2}
          isDisabled={selectedApps.length === 0 || loadingFeatureApps || isUpdating}
          isLoading={isUpdating}
          onClick={() => {
            if (selectedApps.length === 0) return;
            updateFeaturedApps();
          }}
        >
          {t('common:Confirm')} ({selectedApps.length})
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(AddFeatureAppModal);
