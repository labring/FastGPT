import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, HStack, ModalBody, ModalFooter, VStack, Flex, Link } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { postTemplateDatasetCollection } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import { getDocPath } from '@/web/common/system/doc';
import { Trans } from 'next-i18next';

const TemplateImportModal = ({
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

  const { runAsync: onImport, loading: isImporting } = useRequest2(
    async () => {
      await postTemplateDatasetCollection({
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
      successToast: t('common:import_success')
    }
  );

  const handleDownloadTemplate = () => {
    const templateContent = `q,a,indexes
"Who are you?","I am an AI assistant, here to help with your questions and provide support. I can assist with learning, daily life queries, and creative ideas.","1. What are you?\n2. What can you do?\n3. What topics can you help with?\n4. How do you assist users?\n5. What's your goal?","Who are you? I am an AI assistant..."
"What are you?","I am an AI assistant designed to help users with their questions and provide support across various topics.","What are you?","I am an AI assistant..."`;

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <MyModal
      iconSrc="common/layer"
      iconColor={'primary.600'}
      title={t('dataset:template_dataset')}
      isOpen
      w={'500px'}
      h={'auto'}
    >
      <ModalBody py={6} px={8}>
        <VStack spacing={3} alignItems="stretch">
          <Flex justify={'space-between'} align={'center'} fontSize={'sm'} fontWeight={500}>
            <Box color={'myGray.900'}>{t('dataset:upload_by_template_format')}</Box>
            <Link
              display={'flex'}
              alignItems={'center'}
              gap={0.5}
              href={getDocPath('/docs/guide/knowledge_base/template/')}
              color="primary.600"
              target="_blank"
            >
              <MyIcon name={'book'} w={'18px'} />
              {t('common:Instructions')}
            </Link>
          </Flex>

          <Button
            variant="whiteBase"
            w={'100%'}
            h={'48px'}
            leftIcon={<MyIcon name={'common/download'} w={'18px'} />}
            onClick={handleDownloadTemplate}
          >
            {t('dataset:download_csv_template')}
          </Button>

          <FileSelector
            maxCount={1}
            maxSize="100MB"
            fileType=".csv"
            selectFiles={selectFiles}
            setSelectFiles={setSelectFiles}
            FileTypeNode={
              <Box fontSize={'xs'}>
                <Trans
                  i18nKey={'file:template_csv_file_select_tip'}
                  values={{
                    fileType: '.csv'
                  }}
                  components={{
                    highlight: <Box as="span" color="primary.600" fontWeight="medium" />
                  }}
                />
              </Box>
            }
          />

          {/* File render */}
          {selectFiles.length > 0 && (
            <VStack gap={2}>
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
        </VStack>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={isImporting} variant="whiteBase" mr={2} onClick={onClose}>
          {t('common:Close')}
        </Button>
        <Button onClick={onImport} isDisabled={selectFiles.length === 0 || isImporting}>
          {isImporting
            ? percent === 100
              ? t('dataset:data_parsing')
              : t('dataset:data_uploading', { num: percent })
            : t('common:comfirm_import')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default TemplateImportModal;
