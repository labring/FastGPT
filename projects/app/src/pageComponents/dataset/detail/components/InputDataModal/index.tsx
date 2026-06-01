import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import DataInputPanel from './DataInputPanel';
import IndexInputPanel from './IndexInputPanel';
import { TabEnum, useInputDataModal, type InputDataType } from './useInputDataModal';

const InputDataModal = ({
  collectionId,
  dataId,
  defaultValue,
  onClose,
  onSuccess
}: {
  collectionId: string;
  dataId?: string;
  defaultValue?: { q?: string; a?: string; imagePreivewUrl?: string };
  onClose: () => void;
  onSuccess: (data: InputDataType & { dataId: string }) => void;
}) => {
  const { t } = useTranslation();
  const {
    collection,
    currentTab,
    deletingIndexClientId,
    editingIndexClientId,
    focusIndexClientId,
    imagePreivewUrl,
    indexes,
    initLoading,
    isDeletingIndex,
    isImporting,
    isUpdating,
    maxToken,
    register,
    showTabs,
    submitData,
    watchedIndexes,
    onDeleteIndex,
    onSaveIndex,
    prependCustomIndex,
    setCurrentTab,
    clearFocusIndexClientId,
    markEditingIndex,
    clearEditingIndex,
    markDeletingIndex,
    updateIndexFold
  } = useInputDataModal({
    collectionId,
    dataId,
    defaultValue,
    onSuccess
  });

  return (
    <MyModal
      isOpen={true}
      isCentered
      w={['calc(100vw - 32px)', '800px']}
      onClose={onClose}
      closeOnOverlayClick={false}
      maxW={['calc(100vw - 32px)', '800px']}
      h={['auto', currentTab === TabEnum.image ? '584px' : '620px']}
      maxH={['90vh', 'calc(100vh - 48px)']}
      borderRadius={'10px'}
      bg={'white'}
      boxShadow={'3.5'}
      title={
        <Box
          className={'textEllipsis'}
          wordBreak={'break-all'}
          fontSize={['xl', '20px']}
          lineHeight={['28px', '26px']}
          maxW={['calc(100vw - 96px)', '680px']}
          fontWeight={'500'}
          letterSpacing={'0.15px'}
          color={'black'}
          whiteSpace={'nowrap'}
          overflow={'hidden'}
          textOverflow={'ellipsis'}
        >
          {collection.sourceName || t('common:unknow_source')}
        </Box>
      }
      isLoading={initLoading}
      overflow={'hidden'}
    >
      <Box
        display={'flex'}
        flexDir={'column'}
        flex={'1 0 0'}
        minH={['300px', showTabs ? '506px' : '450px']}
        overflow={'hidden'}
      >
        {!initLoading && (
          <Flex
            flexDir={'column'}
            gap={'24px'}
            w={'100%'}
            h={['auto', showTabs ? '506px' : '450px']}
            minH={0}
          >
            {showTabs && (
              <Flex
                h={'32px'}
                gap={'16px'}
                borderBottom={'1px solid'}
                borderColor={'borderColor.low'}
                flexShrink={0}
              >
                {[
                  { label: t('common:dataset_data_input_chunk'), value: TabEnum.chunk },
                  { label: t('common:dataset_data_input_qa'), value: TabEnum.qa }
                ].map((item) => {
                  const isActive = currentTab === item.value;
                  return (
                    <Flex
                      key={item.value}
                      alignItems={'center'}
                      justifyContent={'center'}
                      h={'32px'}
                      px={'4px'}
                      borderBottom={'1.5px solid'}
                      borderColor={isActive ? 'primary.600' : 'transparent'}
                      color={isActive ? 'primary.700' : 'myGray.500'}
                      fontSize={'16px'}
                      lineHeight={'24px'}
                      fontWeight={'500'}
                      letterSpacing={'0.15px'}
                      cursor={'pointer'}
                      onClick={() => setCurrentTab(item.value)}
                    >
                      {item.label}
                    </Flex>
                  );
                })}
              </Flex>
            )}

            <Flex
              flex={'1 0 0'}
              h={['auto', '450px']}
              gap={'32px'}
              flexDir={['column', 'row']}
              minH={0}
            >
              <DataInputPanel
                canWrite={collection.permission.hasWritePer}
                currentTab={currentTab}
                imagePreivewUrl={imagePreivewUrl}
                isImporting={isImporting}
                isUpdating={isUpdating}
                isIndexEditing={!!editingIndexClientId}
                register={register}
                submitData={submitData}
              />
              <IndexInputPanel
                canWrite={collection.permission.hasWritePer}
                deletingIndexClientId={deletingIndexClientId}
                focusIndexClientId={focusIndexClientId}
                indexes={indexes}
                isDeletingIndex={isDeletingIndex}
                maxToken={maxToken}
                register={register}
                watchedIndexes={watchedIndexes}
                onAddIndex={prependCustomIndex}
                onDeleteIndex={onDeleteIndex}
                onSaveIndex={onSaveIndex}
                onAutoFocusIndex={clearFocusIndexClientId}
                onIndexFocus={markEditingIndex}
                onIndexBlur={clearEditingIndex}
                onDeleteIntent={markDeletingIndex}
                updateIndexFold={updateIndexFold}
              />
            </Flex>
          </Flex>
        )}
      </Box>
    </MyModal>
  );
};

export default React.memo(InputDataModal);
