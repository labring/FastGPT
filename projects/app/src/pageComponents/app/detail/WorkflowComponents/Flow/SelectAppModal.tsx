import React, { useState } from 'react';
import { Avatar, Box, Button, Flex, ModalBody, ModalFooter, VStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import type { SelectAppItemType } from '@fastgpt/global/core/workflow/template/system/abandoned/runApp/type';
import { useTranslation } from 'next-i18next';
import FolderPath from '@/components/common/folder/Path';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useVirtualList } from '@fastgpt/web/hooks/useVirtualList';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { getMyAppsV2 } from '@/web/core/app/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

const SelectAppModal = ({
  value,
  filterAppIds = [],
  onClose,
  onSuccess
}: {
  value?: SelectAppItemType;
  filterAppIds?: string[];
  onClose: () => void;
  onSuccess: (e: SelectAppItemType) => void;
}) => {
  const { t } = useTranslation();
  const [selectedApp, setSelectedApp] = useState<SelectAppItemType | undefined>(value);
  const [parentId, setParentId] = useState<ParentIdType>('');
  const filterAppIdsKey = filterAppIds.join(',');

  const { data: paths = [] } = useRequest(
    () => getAppFolderPath({ sourceId: parentId, type: 'current' }),
    {
      manual: false,
      refreshDeps: [parentId]
    }
  );

  const { scrollDataList, ScrollList, isLoading } = useVirtualList(getMyAppsV2, {
    params: {
      parentId,
      type: [AppTypeEnum.folder, AppTypeEnum.simple, AppTypeEnum.workflow]
    },
    pageSize: 50,
    itemHeight: 40,
    EmptyTip: <EmptyTip text={t('common:folder.empty')} />,
    refreshDeps: [parentId, filterAppIdsKey]
  });

  return (
    <MyModal
      isOpen
      title={t('common:core.module.Select app')}
      iconSrc="/imgs/workflow/ai.svg"
      onClose={onClose}
      position={'relative'}
      w={'600px'}
      isLoading={isLoading && scrollDataList.length === 0}
    >
      <ModalBody
        display={'flex'}
        flexDirection={'column'}
        flex={'1 0 0'}
        overflow={'hidden'}
        minH={'400px'}
        position={'relative'}
      >
        {paths.length > 0 && (
          <Box mb={3} flexShrink={0}>
            <FolderPath paths={paths} onClick={setParentId} />
          </Box>
        )}
        <ScrollList flex={1} minH={0}>
          <VStack align={'stretch'} spacing={0}>
            {scrollDataList.map(({ data: item }) => {
              if (filterAppIds.includes(item._id)) {
                // 分页游标仍按服务端原始列表计算，过滤项保留固定行高避免虚拟窗口错位。
                return <Box key={item._id} h={'40px'} flexShrink={0} aria-hidden />;
              }
              const isFolder = item.type === AppTypeEnum.folder;
              const isSelected = selectedApp?.id === item._id;

              return (
                <Flex
                  key={item._id}
                  alignItems={'center'}
                  gap={2}
                  px={3}
                  py={1.5}
                  minH={'40px'}
                  borderRadius={'md'}
                  cursor={'pointer'}
                  bg={isSelected ? 'primary.50' : undefined}
                  _hover={{ bg: isSelected ? 'primary.50' : 'myGray.100' }}
                  onClick={() => {
                    if (isFolder) {
                      setParentId(item._id);
                    } else {
                      setSelectedApp({ id: item._id });
                    }
                  }}
                >
                  {isFolder ? (
                    <MyIcon name={'common/folderFill'} w={'1.25rem'} color={'myGray.500'} />
                  ) : (
                    <Avatar src={item.avatar} w={'1.5rem'} h={'1.5rem'} borderRadius={'sm'} />
                  )}
                  <Box flex={1} minW={0} className={'textEllipsis'}>
                    {item.name}
                  </Box>
                  {isFolder && <MyIcon name={'common/rightArrowFill'} w={'1rem'} />}
                </Flex>
              );
            })}
          </VStack>
        </ScrollList>
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Cancel')}
        </Button>
        <Button
          ml={2}
          isDisabled={!selectedApp}
          onClick={() => {
            if (!selectedApp) return;
            onSuccess(selectedApp);
            onClose();
          }}
        >
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(SelectAppModal);
