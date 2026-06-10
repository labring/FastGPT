import React, { useState, useMemo } from 'react';
import { Flex, Button, ModalBody, ModalFooter, HStack, Spacer, useDisclosure } from '@chakra-ui/react';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import { DatasetSelect } from './DatasetSelect';
import QuickCreateDatasetModal from '@/pageComponents/app/detail/components/QuickCreateDatasetModal';
import { useUserStore } from '@/web/support/user/useUserStore';

// Dataset selection modal component with SxF design style
export const SfDatasetSelectModal = ({
  isOpen = true,
  defaultSelectedDatasets = [],
  onChange,
  onClose,
  scene = '',
  formatResData
}: {
  isOpen?: boolean;
  defaultSelectedDatasets: SelectedDatasetType[];
  scene?: string;
  onChange: (e: SelectedDatasetType[]) => void;
  onClose: () => void;
  formatResData?: (datasetList: DatasetListItemType[]) => DatasetListItemType[];
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();

  // Current selected datasets, initialized with defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType[]>(defaultSelectedDatasets);

  // Use server-side search, following the logic of the dataset list page
  const {
    paths,
    parentId,
    setParentId,
    searchKey,
    setSearchKey,
    datasets,
    isFetching,
    loadDatasets
  } = useDatasetSelect();

  const {
    isOpen: isQuickCreateOpen,
    onOpen: onOpenQuickCreate,
    onClose: onCloseQuickCreate
  } = useDisclosure();
  const isRootEmpty = useMemo(() => {
    return datasets.length === 0 && paths.length === 0 && !searchKey && !isFetching;
  }, [datasets.length, isFetching, paths.length, searchKey]);

  return (
    <MyModal
      iconSrc="/imgs/workflow/db.png"
      title={t('common:core.chat.Select dataset')}
      isOpen={isOpen}
      onClose={onClose}
      minW="800px"
      maxW={'800px'}
      h={'100%'}
      minH={'496px'}
      maxH={'90vh'}
      isCentered
      isLoading={isFetching}
    >
      <Flex h="100%" direction="column" flex={1} overflow="hidden" minH={0}>
        <ModalBody flex={1} overflow="hidden" minH={0}>
          <DatasetSelect
            paths={paths}
            setParentId={setParentId}
            searchKey={searchKey}
            setSearchKey={setSearchKey}
            datasets={datasets}
            isFetching={isFetching}
            selectedDatasets={selectedDatasets}
            setSelectedDatasets={setSelectedDatasets}
            scene={scene}
          />
        </ModalBody>

        {/* Modal footer button area */}
        <ModalFooter>
          <HStack spacing={4} w="full" align="center">
            {!isRootEmpty && userInfo?.team?.permission.hasDatasetCreatePer && (
              <Button
                leftIcon={<MyIcon name="common/addLight" w={4} />}
                variant={'transparentBase'}
                color={'primary.700'}
                fontSize={'mini'}
                onClick={onOpenQuickCreate}
              >
                {t('common:new_create')}
              </Button>
            )}
            <Spacer />
            <HStack spacing={3} align="center">
              <Button variant={'whiteBase'} onClick={onClose}>
                {t('common:Cancel')}
              </Button>
              <MyTooltip
                label={t('app:files_cascader_select_first')}
                isDisabled={selectedDatasets.length > 0}
              >
                <Button
                  colorScheme="blue"
                  isDisabled={selectedDatasets.length === 0}
                  onClick={() => {
                    // Close modal and return selected datasets
                    onClose();
                    onChange(selectedDatasets);
                  }}
                >
                  {t('common:Confirm')}
                </Button>
              </MyTooltip>
            </HStack>
          </HStack>
        </ModalFooter>
      </Flex>

      {isQuickCreateOpen && (
        <QuickCreateDatasetModal
          parentId={parentId}
          onClose={onCloseQuickCreate}
          onSuccess={(newDataset) => {
            setSelectedDatasets((prev) => [...prev, newDataset]);
            loadDatasets();
          }}
        />
      )}
    </MyModal>
  );
};

export default SfDatasetSelectModal;
