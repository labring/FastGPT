import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, HStack, ModalBody, ModalFooter, VStack } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { postBackupDatasetCollection } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import LightTip from '@fastgpt/web/components/common/LightTip';

const BackupImportModal = ({
  onFinish,
  onClose
}: {
  onFinish: () => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);

  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [percent, setPercent] = useState(0);

  const { runAsync: onBackupImport, loading: isBackupLoading } = useRequest2(
    async () => {
      await postBackupDatasetCollection({
        datasetId,
        file: selectFiles[0].file,
        percentListen: setPercent
      });
    },
    {
      onSuccess() {
        onFinish();
        onClose();
      },
      successToast: t('dataset:backup_dataset_success')
    }
  );

  return (
    <MyModal iconSrc="backup" iconColor={'primary.600'} isOpen title={t('dataset:backup_dataset')}>
      <ModalBody>
        <LightTip mb={3} icon="common/info" text={t('dataset:backup_dataset_tip')} />

        <FileSelector
          maxCount={1}
          fileType=".csv"
          selectFiles={selectFiles}
          setSelectFiles={(e) => setSelectFiles(e)}
        />
        {/* File render */}
        {selectFiles.length > 0 && (
          <VStack mt={4} gap={2}>
            {selectFiles.map((item, index) => (
              <HStack key={index} w={'100%'}>
                <MyIcon name={item.icon as any} w={'1rem'} />
                <Box color={'myGray.900'}>{item.name}</Box>
                <Box fontSize={'xs'} color={'myGray.500'} flex={1}>
                  {item.size}
                </Box>
                <MyIconButton
                  icon="delete"
                  hoverColor="red.500"
                  hoverBg="red.50"
                  onClick={() => {
                    setSelectFiles(selectFiles.filter((_, i) => i !== index));
                  }}
                />
              </HStack>
            ))}
          </VStack>
        )}
      </ModalBody>
      <ModalFooter>
        <Button isLoading={isBackupLoading} variant="whiteBase" mr={2} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button onClick={onBackupImport} isDisabled={selectFiles.length === 0 || isBackupLoading}>
          {isBackupLoading
            ? percent === 100
              ? t('dataset:data_parsing')
              : t('dataset:data_uploading', { num: percent })
            : t('common:Import')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default BackupImportModal;
