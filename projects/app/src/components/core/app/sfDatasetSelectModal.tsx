import React, { useState } from 'react';
import { Flex, Button, ModalBody, ModalFooter, HStack, Spacer } from '@chakra-ui/react';
import type { SelectedDatasetType } from '@fastgpt/global/core/workflow/type/io';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useDatasetSelect } from '@/components/core/dataset/SelectModal';
import { DatasetSelect } from './DatasetSelect';

// Dataset selection modal component with SxF design style
export const SfDatasetSelectModal = ({
  isOpen,
  defaultSelectedDatasets = [],
  onChange,
  onClose,
  scene = '',
  formatResData
}: {
  isOpen: boolean;
  defaultSelectedDatasets: SelectedDatasetType;
  scene?: string;
  onChange: (e: SelectedDatasetType) => void;
  onClose: () => void;
  formatResData?: (datasetList: DatasetListItemType[]) => DatasetListItemType[];
}) => {
  const { t } = useTranslation();

  // Current selected datasets, initialized with defaultSelectedDatasets
  const [selectedDatasets, setSelectedDatasets] =
    useState<SelectedDatasetType>(defaultSelectedDatasets);

  // Use server-side search, following the logic of the dataset list page
  const { paths, setParentId, searchKey, setSearchKey, datasets, isFetching } = useDatasetSelect(
    scene,
    formatResData
  );

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
    </MyModal>
  );
};

export default SfDatasetSelectModal;
