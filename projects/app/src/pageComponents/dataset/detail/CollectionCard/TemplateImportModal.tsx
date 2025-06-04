import React, { useState, useMemo } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, HStack, ModalBody, ModalFooter, VStack, Flex, Text } from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { postBackupDatasetCollection } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';

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
      successToast: t('common:import_success')
    }
  );

  const handleDownloadTemplate = () => {
    const templateContent =
      `q,a,indexes,\n` +
      `"你是谁呀？","我呀，是 AI 小助手哟，专门在这儿随时准备着，陪你交流、为你答疑解惑，不管是学习上的知识探讨，生活里的小疑问，还是创意灵感的碰撞，我都能尽力参与，用我的 “知识大脑” 给你提供帮助和陪伴呢，就盼着能成为你互动交流、探索世界的好伙伴呀 。","1. 你是什么？\n2. 你能做什么？\n3. 你可以解答哪些方面的疑问？\n4. 你希望成为什么样的伙伴？\n5. 你如何提供帮助？","你是谁呀？我呀，是 AI 小助手哟，专门在这儿随时准备着...（重复内容）"\n` +
      `"你是什么？","我是 AI 小助手，专门随时准备陪用户交流、为用户答疑解惑，能参与学习上的知识探讨、生活里的小疑问以及创意灵感的碰撞，用 “知识大脑” 提供帮助和陪伴，希望成为用户互动交流、探索世界的好伙伴。","你是什么？","我是 AI 小助手，专门随时准备陪用户交流...（重复内容）"\n` +
      `"你能做什么？","能陪用户交流、为用户答疑解惑，参与学习上的知识探讨、生活里的小疑问以及创意灵感的碰撞，用 “知识大脑” 提供帮助和陪伴。","你能做什么？","能陪用户交流、为用户答疑解惑...（重复内容）"\n`;
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'template.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  const fileSelectorDescription = useMemo(() => {
    return (
      <VStack spacing={1} fontSize={'xs'} color={'myGray.600'} textAlign={'center'}>
        <Text>
          {t('file:only_support')}
          <Text as="span" color="primary.600" fontWeight="medium">
            {t('file:template_strict_highlight')}
          </Text>
          {t('file:only_support_template_strict_suffix', {
            fileType: '.csv',
            count: 1
          })}
        </Text>
        <Text>{t('file:max_size_per_file', { maxSize: '100MB' })}</Text>
      </VStack>
    );
  }, [t]);

  return (
    <MyModal
      iconSrc="common/template"
      title={t('dataset:template_dataset')}
      isOpen
      onClose={onClose}
      w={'500px'}
      h={'auto'}
    >
      <ModalBody py={6} px={8}>
        <VStack spacing={3} alignItems="stretch">
          <Flex justify={'space-between'} align={'center'} color={'#24282C'}>
            <Box fontWeight={'medium'} fontSize={'md'}>
              {t('dataset:upload_by_template_format')}
            </Box>
            <Button
              px={0}
              variant="ghost"
              onClick={() => {
                window.open('http://localhost:1313/docs/guide/knowledge_base/template/', '_blank');
              }}
              color="primary.600"
              _hover={{ bg: 'primary.50' }}
            >
              <MyIcon name={'book'} w={'18px'} />
              {t('common:Instructions')}
            </Button>
          </Flex>

          <Button
            variant="outline"
            w={'100%'}
            h={'2.5rem'}
            padding={'1.5rem 2rem'}
            leftIcon={<MyIcon name={'common/download'} w={'18px'} />}
            borderColor={'myGray.300'}
            _hover={{ bg: 'myGray.50' }}
            onClick={handleDownloadTemplate}
          >
            {t('dataset:download_csv_template')}
          </Button>

          <VStack spacing={3} alignItems="stretch" w="full">
            <FileSelector
              maxCount={1}
              fileType=".csv"
              selectFiles={selectFiles}
              setSelectFiles={setSelectFiles}
              customDescriptionNode={fileSelectorDescription}
            />

            {selectFiles.length > 0 && (
              <VStack mt={4} gap={2} alignItems={'flex-start'}>
                {selectFiles.map((item, index) => (
                  <HStack key={index} w={'100%'}>
                    <MyIcon name={item.icon as any} w={'1rem'} />
                    <Box color={'myGray.900'}>{item.name}</Box>
                    <MyIconButton
                      icon="common/closeLight"
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
        </VStack>
      </ModalBody>
      <ModalFooter>
        <Button
          isLoading={isBackupLoading}
          onClick={onBackupImport}
          isDisabled={selectFiles.length === 0 || isBackupLoading}
        >
          {isBackupLoading
            ? percent === 100
              ? t('dataset:backup_data_parse')
              : t('dataset:backup_data_uploading', { num: percent })
            : t('common:comfirm_import')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default TemplateImportModal;
