import React, { useMemo, useState, useCallback } from 'react';
// 引入Chakra UI的各种组件，用于页面布局和样式
import {
  Card,
  Flex,
  Box,
  Button,
  ModalBody,
  ModalFooter,
  useTheme,
  Grid,
  Divider,
  Input,
  InputGroup,
  InputLeftElement,
  Checkbox,
  Text,
  VStack,
  HStack,
  IconButton,
  Badge,
  Spacer,
  Icon
} from '@chakra-ui/react';
import {
  SearchIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CloseIcon,
  InfoIcon
} from '@chakra-ui/icons';
// 头像组件
import Avatar from '@fastgpt/web/components/common/Avatar';
// 类型定义，SelectedDatasetType是已选知识库的类型
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
// 自定义的消息提示hook
import { useToast } from '@fastgpt/web/hooks/useToast';
// 自定义的带提示气泡的组件
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
// 自定义的图标组件
import MyIcon from '@fastgpt/web/components/common/Icon';
// 知识库类型的枚举
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
// 国际化hook，用于多语言
import { useTranslation } from 'next-i18next';
// 知识库选择弹窗的容器和hook
import DatasetSelectContainer, { useDatasetSelect } from '@/components/core/dataset/SelectModal';
// 自定义的加载动画hook
import { useLoading } from '@fastgpt/web/hooks/useLoading';
// 数据集API
import { getDatasets } from '@/web/core/dataset/api';
// 请求hook
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
// 空内容提示组件
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

// 知识库选择弹窗组件
export const DatasetSelectModal = ({
  isOpen, // 弹窗是否打开
  defaultSelectedDatasets = [], // 默认已选的知识库
  onChange, // 选择变化时的回调
  onClose // 关闭弹窗的回调
}: {
  isOpen: boolean;
  defaultSelectedDatasets: SelectedDatasetType;
  onChange: (e: SelectedDatasetType) => void;
  onClose: () => void;
}) => {
  // t是翻译函数
  const { t } = useTranslation();
  // theme用于获取主题样式
  const theme = useTheme();
  // selectedDatasets是当前已选的知识库，初始值为defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType>(defaultSelectedDatasets);
  // 搜索关键词状态
  const [searchKey, setSearchKey] = useState<string>('');
  // 展开的文件夹ID列表
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  // toast用于弹出提示消息
  const { toast } = useToast();
  // paths是当前路径，setParentId用于切换文件夹，datasets是当前可选的知识库，isFetching表示是否正在加载
  const { paths, setParentId, datasets, isFetching } = useDatasetSelect();

  // 获取所有数据集用于文件夹逻辑判断
  const { data: allDatasets } = useRequest2(
    () => getDatasets({ parentId: '', getAllDatasets: true }),
    {
      manual: false,
      refreshDeps: []
    }
  );

  // Loading是加载动画组件
  const { Loading } = useLoading();

  // 根据搜索关键词过滤知识库列表
  const filteredDatasets = useMemo(() => {
    if (!searchKey.trim()) return datasets;
    return datasets.filter(
      (item) =>
        item.name.toLowerCase().includes(searchKey.toLowerCase()) ||
        item.intro?.toLowerCase().includes(searchKey.toLowerCase())
    );
  }, [datasets, searchKey]);

  // 调试：显示接收到的数据集信息
  React.useEffect(() => {
    console.log(`[调试] 当前文件夹数据集列表更新，总数: ${datasets.length}`);
    console.log(
      `[调试] 当前文件夹数据集详情:`,
      datasets.map((item) => ({
        id: item._id,
        name: item.name,
        type: item.type,
        parentId: (item as any).parentId,
        vectorModel: item.vectorModel?.model
      }))
    );
  }, [datasets]);

  // 调试：显示所有数据集信息（用于文件夹逻辑判断）
  React.useEffect(() => {
    if (allDatasets) {
      console.log(`[调试] 所有数据集列表更新，总数: ${allDatasets.length}`);
      console.log(
        `[调试] 所有数据集详情:`,
        allDatasets.map((item) => ({
          id: item._id,
          name: item.name,
          type: item.type,
          parentId: (item as any).parentId,
          vectorModel: item.vectorModel?.model,
          hasParentId: (item as any).parentId !== undefined && (item as any).parentId !== null
        }))
      );

      const folders = allDatasets.filter((item) => item.type === DatasetTypeEnum.folder);
      const knowledgeBases = allDatasets.filter((item) => item.type !== DatasetTypeEnum.folder);
      console.log(
        `[调试] 全部文件夹数量: ${folders.length}, 全部知识库数量: ${knowledgeBases.length}`
      );
      console.log(
        `[调试] 全部文件夹:`,
        folders.map((item) => ({ id: item._id, name: item.name }))
      );
      console.log(
        `[调试] 全部知识库及其父子关系:`,
        knowledgeBases.map((item) => ({
          id: item._id,
          name: item.name,
          parentId: (item as any).parentId,
          vectorModel: item.vectorModel?.model
        }))
      );
    }
  }, [allDatasets]);

  // 当前已选知识库的向量模型（只取第一个）
  const activeVectorModel = selectedDatasets[0]?.vectorModel?.model;

  // 获取文件夹下直接的知识库（不包括子文件夹）
  const getDirectDatasets = (folderId?: string) => {
    // 使用 allDatasets 来查找所有层级的知识库
    const dataSource = allDatasets || [];
    console.log(`[调试] getDirectDatasets - 开始查找文件夹${folderId}下的知识库`);
    console.log(
      `[调试] getDirectDatasets - 数据源状态: allDatasets=${!!allDatasets}, 数据源长度=${dataSource.length}`
    );

    if (dataSource.length === 0) {
      console.log(`[调试] getDirectDatasets - 警告：数据源为空，无法查找文件夹下的知识库`);
      return [];
    }

    const result = dataSource.filter(
      (item) =>
        item.type !== DatasetTypeEnum.folder &&
        (folderId ? (item as any).parentId === folderId : !(item as any).parentId)
    );

    console.log(
      `[调试] getDirectDatasets - 文件夹ID: ${folderId}, 使用数据源: ${dataSource.length}个数据集, 找到的直属知识库:`,
      result.map((item) => ({
        id: item._id,
        name: item.name,
        parentId: (item as any).parentId,
        vectorModel: item.vectorModel?.model
      }))
    );

    // 额外调试：显示所有符合条件的候选项
    if (folderId) {
      const candidates = dataSource.filter((item) => (item as any).parentId === folderId);
      console.log(
        `[调试] getDirectDatasets - 所有parentId=${folderId}的数据集:`,
        candidates.map((item) => ({
          id: item._id,
          name: item.name,
          type: item.type,
          parentId: (item as any).parentId
        }))
      );
    }

    return result;
  };

  // 检查文件夹是否可选择 - 根据用户需求：文件夹内的知识库索引都一样&&(未选择其他知识库||文件夹的知识库索引与当前已选知识库索引类型相同)
  const isFolderSelectable = (folderId: string) => {
    console.log(`[调试] isFolderSelectable - 开始检查文件夹: ${folderId}`);

    const directDatasets = getDirectDatasets(folderId);
    console.log(`[调试] isFolderSelectable - 文件夹下直属知识库数量: ${directDatasets.length}`);

    // 如果文件夹下没有知识库，不可选择
    if (directDatasets.length === 0) {
      console.log(`[调试] isFolderSelectable - 文件夹下没有知识库，不可选择`);
      return false;
    }

    // 检查文件夹内的知识库索引是否都一样
    const firstVectorModel = directDatasets[0]?.vectorModel?.model;
    console.log(`[调试] isFolderSelectable - 第一个知识库的向量模型: ${firstVectorModel}`);

    const allSameIndex = directDatasets.every(
      (item) => item.vectorModel?.model === firstVectorModel
    );
    console.log(`[调试] isFolderSelectable - 所有知识库索引是否一致: ${allSameIndex}`);
    console.log(
      `[调试] isFolderSelectable - 各知识库的向量模型:`,
      directDatasets.map((item) => ({
        name: item.name,
        model: item.vectorModel?.model
      }))
    );

    // 如果文件夹内的知识库索引不一样，不可选择
    if (!allSameIndex) {
      console.log(`[调试] isFolderSelectable - 文件夹内知识库索引不一致，不可选择`);
      return false;
    }

    console.log(`[调试] isFolderSelectable - 当前已选知识库的向量模型: ${activeVectorModel}`);

    // 如果当前没有选中任何知识库，文件夹可选择（因为文件夹内索引都一样）
    if (!activeVectorModel) {
      console.log(`[调试] isFolderSelectable - 当前无已选知识库，文件夹可选择`);
      return true;
    }

    // 检查文件夹的知识库索引与当前已选知识库索引类型是否相同
    const isCompatible = firstVectorModel === activeVectorModel;
    console.log(
      `[调试] isFolderSelectable - 文件夹索引(${firstVectorModel})与已选索引(${activeVectorModel})是否兼容: ${isCompatible}`
    );
    return isCompatible;
  };

  // 检查文件夹是否已全选（检查文件夹下的直属知识库是否都被选中）
  const isFolderFullySelected = (folderId: string) => {
    const directDatasets = getDirectDatasets(folderId);
    if (directDatasets.length === 0) {
      console.log(`[调试] isFolderFullySelected - 文件夹${folderId}下没有知识库，返回false`);
      return false;
    }

    const selectedCount = directDatasets.filter((item) =>
      selectedDatasets.some((selected) => selected.datasetId === item._id)
    ).length;

    const isFullySelected = directDatasets.every((item) =>
      selectedDatasets.some((selected) => selected.datasetId === item._id)
    );

    console.log(
      `[调试] isFolderFullySelected - 文件夹${folderId}: 总数${directDatasets.length}, 已选${selectedCount}, 全选状态${isFullySelected}`
    );
    return isFullySelected;
  };

  // 处理知识库选择
  const handleDatasetSelect = (item: any, checked: boolean) => {
    if (checked) {
      // 检查向量模型是否一致
      if (activeVectorModel && activeVectorModel !== item.vectorModel.model) {
        toast({
          status: 'warning',
          title: t('common:dataset.Select Dataset Tips')
        });
        return;
      }
      // 添加到已选列表
      setSelectedDatasets((prev) => [
        ...prev,
        {
          datasetId: item._id,
          avatar: item.avatar,
          name: item.name,
          vectorModel: item.vectorModel
        }
      ]);
    } else {
      // 从已选列表中移除
      setSelectedDatasets((prev) => prev.filter((dataset) => dataset.datasetId !== item._id));
    }
  };

  // 处理文件夹选择 - 根据用户需求：选择文件夹下所有直接属于该文件夹的知识库
  const handleFolderSelect = (folderId: string, checked: boolean) => {
    console.log(
      `[调试] handleFolderSelect - 文件夹${folderId}, 操作: ${checked ? '选择' : '取消选择'}`
    );

    const directDatasets = getDirectDatasets(folderId);
    console.log(
      `[调试] handleFolderSelect - 文件夹下直属知识库:`,
      directDatasets.map((item) => ({
        id: item._id,
        name: item.name,
        selected: isDatasetSelected(item._id)
      }))
    );

    if (checked) {
      // 由于isFolderSelectable已经确保了文件夹内索引一致且兼容，直接选择所有未选中的知识库
      const unselectedDatasets = directDatasets.filter((item) => !isDatasetSelected(item._id));
      console.log(
        `[调试] handleFolderSelect - 需要新选择的知识库:`,
        unselectedDatasets.map((item) => ({
          id: item._id,
          name: item.name
        }))
      );

      const newSelections = unselectedDatasets.map((item) => ({
        datasetId: item._id,
        avatar: item.avatar,
        name: item.name,
        vectorModel: item.vectorModel
      }));

      console.log(`[调试] handleFolderSelect - 即将添加的选择:`, newSelections);
      setSelectedDatasets((prev) => {
        const newState = [...prev, ...newSelections];
        console.log(
          `[调试] handleFolderSelect - 更新后的已选知识库:`,
          newState.map((item) => ({
            id: item.datasetId,
            name: item.name
          }))
        );
        return newState;
      });
    } else {
      // 取消选择文件夹下的所有知识库
      const datasetIds = directDatasets.map((item) => item._id);
      console.log(`[调试] handleFolderSelect - 需要取消选择的知识库ID:`, datasetIds);

      setSelectedDatasets((prev) => {
        const newState = prev.filter((dataset) => !datasetIds.includes(dataset.datasetId));
        console.log(
          `[调试] handleFolderSelect - 取消选择后的已选知识库:`,
          newState.map((item) => ({
            id: item.datasetId,
            name: item.name
          }))
        );
        return newState;
      });
    }
  };

  // 处理文件夹展开/收起
  const handleFolderToggle = (folderId: string) => {
    setExpandedFolders((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  // 移除已选知识库
  const removeSelectedDataset = (datasetId: string) => {
    setSelectedDatasets((prev) => prev.filter((dataset) => dataset.datasetId !== datasetId));
  };

  // 检查知识库是否已选中
  const isDatasetSelected = useCallback(
    (datasetId: string) => {
      return selectedDatasets.some((dataset) => dataset.datasetId === datasetId);
    },
    [selectedDatasets]
  );

  // 检查知识库是否禁用
  const isDatasetDisabled = (item: any) => {
    return activeVectorModel && activeVectorModel !== item.vectorModel.model;
  };

  // 全选功能
  const handleSelectAll = (checked: boolean) => {
    console.log(`[调试] handleSelectAll - ${checked ? '全选' : '取消全选'}`);

    if (checked) {
      const dataSource = allDatasets || [];

      // 优先确定根目录下知识库的向量模型
      const rootDatasets = dataSource.filter(
        (item) => item.type !== DatasetTypeEnum.folder && !(item as any).parentId // 根目录下的知识库
      );

      console.log(
        `[调试] handleSelectAll - 根目录知识库:`,
        rootDatasets.map((item) => ({
          id: item._id,
          name: item.name,
          vectorModel: item.vectorModel?.model
        }))
      );

      // 确定要全选的向量模型：优先已选知识库的模型，其次根目录第一个知识库的模型
      const targetModel = activeVectorModel || rootDatasets[0]?.vectorModel?.model;

      if (!targetModel) {
        console.log(`[调试] handleSelectAll - 无法确定目标向量模型`);
        return;
      }

      console.log(`[调试] handleSelectAll - 目标向量模型: ${targetModel}`);

      // 1. 先选择根目录下兼容的知识库
      const compatibleRootDatasets = rootDatasets.filter(
        (item) => item.vectorModel.model === targetModel && !isDatasetSelected(item._id)
      );

      // 2. 再选择兼容文件夹中的知识库（整个文件夹内索引一致且与目标模型兼容）
      const folders = dataSource.filter((item) => item.type === DatasetTypeEnum.folder);
      let compatibleFolderDatasets: any[] = [];

      folders.forEach((folder) => {
        const folderDatasets = getDirectDatasets(folder._id);
        if (folderDatasets.length > 0) {
          // 检查文件夹内索引是否一致
          const firstModel = folderDatasets[0]?.vectorModel?.model;
          const allSame = folderDatasets.every((item) => item.vectorModel?.model === firstModel);

          // 如果文件夹内索引一致且与目标模型兼容，选择整个文件夹
          if (allSame && firstModel === targetModel) {
            const unselectedInFolder = folderDatasets.filter(
              (item) => !isDatasetSelected(item._id)
            );
            compatibleFolderDatasets.push(...unselectedInFolder);
            console.log(
              `[调试] handleSelectAll - 兼容文件夹 ${folder.name}:`,
              unselectedInFolder.map((item) => ({
                id: item._id,
                name: item.name
              }))
            );
          }
        }
      });

      // 合并所有要选择的知识库
      const allCompatibleDatasets = [...compatibleRootDatasets, ...compatibleFolderDatasets];

      console.log(`[调试] handleSelectAll - 即将选择的知识库总数: ${allCompatibleDatasets.length}`);
      console.log(
        `[调试] handleSelectAll - 根目录: ${compatibleRootDatasets.length}个, 文件夹: ${compatibleFolderDatasets.length}个`
      );

      const newSelections = allCompatibleDatasets.map((item) => ({
        datasetId: item._id,
        avatar: item.avatar,
        name: item.name,
        vectorModel: item.vectorModel
      }));

      setSelectedDatasets((prev) => [...prev, ...newSelections]);
    } else {
      // 取消全选
      console.log(`[调试] handleSelectAll - 取消全选，清空所有选择`);
      setSelectedDatasets([]);
    }
  };

  // 检查是否全选状态
  const isAllSelected = useMemo(() => {
    const dataSource = allDatasets || [];

    // 确定当前的目标向量模型
    const rootDatasets = dataSource.filter(
      (item) => item.type !== DatasetTypeEnum.folder && !(item as any).parentId
    );
    const targetModel = activeVectorModel || rootDatasets[0]?.vectorModel?.model;

    if (!targetModel) return false;

    // 1. 根目录下兼容的知识库
    const compatibleRootDatasets = rootDatasets.filter(
      (item) => item.vectorModel.model === targetModel
    );

    // 2. 兼容文件夹中的知识库
    const folders = dataSource.filter((item) => item.type === DatasetTypeEnum.folder);
    let compatibleFolderDatasets: any[] = [];

    folders.forEach((folder) => {
      const folderDatasets = getDirectDatasets(folder._id);
      if (folderDatasets.length > 0) {
        const firstModel = folderDatasets[0]?.vectorModel?.model;
        const allSame = folderDatasets.every((item) => item.vectorModel?.model === firstModel);

        if (allSame && firstModel === targetModel) {
          compatibleFolderDatasets.push(...folderDatasets);
        }
      }
    });

    const allSelectableDatasets = [...compatibleRootDatasets, ...compatibleFolderDatasets];

    console.log(
      `[调试] isAllSelected - 可选择总数: ${allSelectableDatasets.length}, 已选数: ${allSelectableDatasets.filter((item) => isDatasetSelected(item._id)).length}`
    );

    return (
      allSelectableDatasets.length > 0 &&
      allSelectableDatasets.every((item) => isDatasetSelected(item._id))
    );
  }, [allDatasets, activeVectorModel, isDatasetSelected, getDirectDatasets]);

  // 组件渲染
  return (
    <DatasetSelectContainer
      isOpen={isOpen} // 弹窗是否打开
      paths={paths} // 当前路径
      setParentId={setParentId} // 切换文件夹
      tips={null} // 移除顶部提示，改为内部实现
      onClose={onClose} // 关闭弹窗
    >
      {/* 弹窗内容整体布局，纵向排列 */}
      <Flex h={'100%'} flexDirection={'column'} flex={'1 0 0'}>
        {/* 弹窗主体内容 */}
        <ModalBody flex={'1 0 0'} p={0} display="flex" alignItems="center" justifyContent="center">
          {/* 左右分栏布局 */}
          <Flex
            h={'500px'}
            w={'800px'}
            border={'1px solid'}
            borderColor={'gray.200'}
            borderRadius={'md'}
            overflow={'hidden'}
          >
            {/* 左侧：搜索和知识库列表 */}
            <Box w={'50%'} borderRight={'1px solid'} borderColor={'gray.200'} p={4}>
              {/* 搜索框 */}
              <InputGroup mb={4}>
                <InputLeftElement>
                  <SearchIcon w={'16px'} color={'gray.400'} />
                </InputLeftElement>
                <Input
                  placeholder={t('common:Search_knowledge_base')}
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  size="md"
                />
              </InputGroup>

              {/* 知识库列表 */}
              <VStack align="stretch" spacing={0} h={'390px'} overflowY="auto">
                {filteredDatasets.length === 0 ? (
                  <EmptyTip text={t('common:folder.empty')} />
                ) : (
                  filteredDatasets.map((item) => (
                    <Box key={item._id}>
                      <Flex
                        align="center"
                        py={1}
                        px={2}
                        borderRadius="md"
                        _hover={{ bg: 'gray.50' }}
                        cursor="pointer"
                        onClick={() => {
                          if (item.type === DatasetTypeEnum.folder) {
                            setParentId(item._id);
                          }
                        }}
                      >
                        {/* 复选框 - 文件夹和知识库都显示复选框 */}
                        <Box
                          w="20px"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          onClick={(e) => e.stopPropagation()} // 阻止复选框区域触发父级点击
                        >
                          {item.type === DatasetTypeEnum.folder ? (
                            (() => {
                              const isSelectable = isFolderSelectable(item._id);
                              const isFullySelected = isFolderFullySelected(item._id);
                              console.log(
                                `[调试] 文件夹复选框渲染 - ${item.name}(${item._id}): 可选=${isSelectable}, 全选=${isFullySelected}`
                              );
                              return (
                                <Checkbox
                                  isChecked={isFullySelected}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    console.log(
                                      `[调试] 文件夹复选框点击 - ${item.name}(${item._id}): 要设置为${checked ? '选中' : '取消选中'}`
                                    );

                                    if (!isSelectable) {
                                      console.log(
                                        `[调试] 文件夹复选框点击 - ${item.name}不可选择，显示警告`
                                      );
                                      toast({
                                        status: 'warning',
                                        title: t('common:dataset.Select Dataset Tips')
                                      });
                                      return;
                                    }
                                    console.log(
                                      `[调试] 文件夹复选框点击 - ${item.name}可选择，执行选择操作`
                                    );
                                    handleFolderSelect(item._id, checked);
                                  }}
                                  colorScheme="blue"
                                  sx={
                                    !isSelectable
                                      ? {
                                          '& .chakra-checkbox__control': {
                                            borderColor: 'gray.200',
                                            opacity: 0.3
                                          }
                                        }
                                      : {}
                                  }
                                />
                              );
                            })()
                          ) : (
                            <Checkbox
                              isChecked={isDatasetSelected(item._id)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                if (checked && isDatasetDisabled(item)) {
                                  toast({
                                    status: 'warning',
                                    title: t('common:dataset.Select Dataset Tips')
                                  });
                                  return;
                                }
                                handleDatasetSelect(item, checked);
                              }}
                              colorScheme="blue"
                              sx={
                                isDatasetDisabled(item)
                                  ? {
                                      '& .chakra-checkbox__control': {
                                        borderColor: 'gray.200',
                                        opacity: 0.5
                                      }
                                    }
                                  : {}
                              }
                            />
                          )}
                        </Box>

                        {/* 图标 */}
                        <Avatar src={item.avatar} w="18px" h="18px" borderRadius="sm" mx={3} />

                        {/* 名称和类型 */}
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" isTruncated>
                            {item.name}
                          </Text>
                          {item.type === DatasetTypeEnum.folder ? (
                            <Text fontSize="xs" color="gray.500">
                              {t('common:Folder')}
                            </Text>
                          ) : (
                            <Text fontSize="xs" color="gray.500">
                              索引: {item.vectorModel.name}
                            </Text>
                          )}
                        </Box>

                        {/* 文件夹展开箭头 */}
                        {item.type === DatasetTypeEnum.folder && (
                          <Box mr={10}>
                            <ChevronRightIcon
                              w="20px"
                              h="20px"
                              color="gray.500"
                              strokeWidth="1px"
                            />
                          </Box>
                        )}
                      </Flex>
                    </Box>
                  ))
                )}
              </VStack>

              {/* 全选功能 */}
              <Box mt={3}>
                <Checkbox
                  isChecked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  colorScheme="blue"
                >
                  <Text fontSize="sm">{t('common:Select_all')}</Text>
                </Checkbox>
              </Box>
            </Box>

            {/* 右侧：已选知识库展示 */}
            <Box w={'50%'} p={4}>
              {/* 已选知识库列表 */}
              <VStack align="stretch" spacing={2} h={'450px'} overflowY="auto">
                {selectedDatasets.length === 0 ? (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    h="full"
                    color="gray.400"
                  >
                    <VStack spacing={2}>
                      <MyIcon name="empty" w="48px" color="gray.300" />
                      <Text fontSize="sm">{t('common:No_selected_dataset')}</Text>
                    </VStack>
                  </Box>
                ) : (
                  selectedDatasets.map((item) => (
                    <Card key={item.datasetId} p={3} boxShadow="sm" bg="primary.50">
                      <Flex align="center">
                        <Avatar src={item.avatar} w="20px" h="20px" borderRadius="sm" mr={3} />
                        <Box flex={1} minW={0}>
                          <Text fontSize="sm" fontWeight="medium" isTruncated>
                            {item.name}
                          </Text>
                        </Box>
                        <IconButton
                          aria-label="Remove"
                          icon={<CloseIcon w="10px" h="10px" />}
                          size="xs"
                          variant="ghost"
                          color="black"
                          _hover={{
                            bg: 'gray.200'
                          }}
                          onClick={() => removeSelectedDataset(item.datasetId)}
                        />
                      </Flex>
                    </Card>
                  ))
                )}
              </VStack>
            </Box>
          </Flex>
        </ModalBody>

        {/* 弹窗底部按钮区域 */}
        <ModalFooter>
          <HStack spacing={4} w="full" align="center">
            <Spacer />
            <HStack spacing={3} align="center">
              <Box px={3} py={2} borderRadius="md" bg="#F0F4FF" display="flex" alignItems="center">
                <InfoIcon w="14px" h="14px" color="blue.500" mr={2} />
                <Text fontSize="xs" color="blue.600">
                  {t('common:dataset.Select Dataset Tips')}
                </Text>
              </Box>
              <Button
                colorScheme="blue"
                onClick={() => {
                  // 关闭弹窗并回传已选知识库
                  onClose();
                  onChange(selectedDatasets);
                }}
              >
                {t('common:Confirm')} ({selectedDatasets.length})
              </Button>
            </HStack>
          </HStack>
        </ModalFooter>

        {/* 加载动画，isFetching为true时显示 */}
        <Loading fixed={false} loading={isFetching} />
      </Flex>
    </DatasetSelectContainer>
  );
};

// 默认导出组件
export default DatasetSelectModal;
