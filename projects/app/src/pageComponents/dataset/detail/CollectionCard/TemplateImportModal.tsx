import React, { useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import {
  Box,
  Button,
  HStack,
  ModalBody,
  ModalFooter,
  VStack,
  Flex,
  Link,
  Checkbox,
  Grid,
  useDisclosure
} from '@chakra-ui/react';
import FileSelector, { type SelectFileItemType } from '../components/FileSelector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import { postTemplateDatasetCollection } from '@/web/core/dataset/api';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useContextSelector } from 'use-context-selector';
import { getDocPath } from '@/web/common/system/doc';
import { Trans } from 'next-i18next';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import ConfigPromptModal from '@/pageComponents/dataset/detail/ConfigPromptModal';

const TemplateImportModal = ({
  onFinish,
  onClose
}: {
  onFinish: () => void;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { feConfigs } = useSystemStore();
  const datasetId = useContextSelector(DatasetPageContext, (v) => v.datasetId);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const [selectFiles, setSelectFiles] = useState<SelectFileItemType[]>([]);
  const [percent, setPercent] = useState(0);

  // Index enhance states
  const [autoIndexes, setAutoIndexes] = useState(false);
  const [hypeIndexes, setHypeIndexes] = useState(false);
  const [imageIndex, setImageIndex] = useState(false);

  // Config prompt modal
  const {
    isOpen: isOpenConfigPrompt,
    onOpen: onOpenConfigPrompt,
    onClose: onCloseConfigPrompt
  } = useDisclosure();
  const [currentPromptType, setCurrentPromptType] = useState<string>('');

  const handleOpenConfigPrompt = (type: string) => {
    setCurrentPromptType(type);
    onOpenConfigPrompt();
  };

  const handleSavePrompt = async (content: string) => {
    // TODO: 后续联调补充保存逻辑
    console.log('Save prompt:', currentPromptType, content);
  };

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
              href={getDocPath('/docs/introduction/guide/knowledge_base/template/')}
              color="primary.600"
              target="_blank"
            >
              <MyIcon name={'book'} w={'18px'} />
              {t('common:Instructions')}
            </Link>
          </Flex>

          <HStack w={'100%'} spacing={2}>
            <Button
              variant="whiteBase"
              flex={1}
              h={'40px'}
              leftIcon={<MyIcon name={'common/download'} w={'18px'} />}
              onClick={handleDownloadTemplate}
            >
              {t('dataset:download_csv_template')}
            </Button>
            <QuestionTip label={t('dataset:template_csv_format_tip')} maxW={'400px'} />
          </HStack>

          <FileSelector
            maxCount={1}
            maxSize="100 MB"
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

          {/* Index enhance */}
          {feConfigs?.show_dataset_enhance !== false && (
            <Box mt={3} fontSize={'sm'} fontWeight={500} color={'myGray.900'}>
              <Box mb={3}>{t('dataset:enhanced_indexes')}</Box>
              <Grid
                gridTemplateColumns={i18n.language === 'en' ? '1fr' : '1fr 1fr'}
                rowGap={[1, 4]}
                columnGap={[3, 7]}
              >
                <HStack flex={'1'} spacing={1}>
                  <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
                    <Checkbox
                      isDisabled={!feConfigs?.isPlus}
                      isChecked={autoIndexes}
                      onChange={(e) => setAutoIndexes(e.target.checked)}
                    >
                      <FormLabel>{t('dataset:auto_indexes')}</FormLabel>
                    </Checkbox>
                  </MyTooltip>
                  <QuestionTip label={t('dataset:auto_indexes_tips')} />
                  <MyTooltip label={t('dataset:config_prompt')}>
                    <MyIcon
                      name={'common/settingLight'}
                      w={'16px'}
                      cursor={'pointer'}
                      color={'myGray.500'}
                      _hover={{ color: 'primary.500' }}
                      onClick={() => handleOpenConfigPrompt('autoIndexes')}
                    />
                  </MyTooltip>
                </HStack>
                <HStack flex={'1'} spacing={1}>
                  <MyTooltip label={!feConfigs?.isPlus ? t('common:commercial_function_tip') : ''}>
                    <Checkbox
                      isDisabled={!feConfigs?.isPlus}
                      isChecked={hypeIndexes}
                      onChange={(e) => setHypeIndexes(e.target.checked)}
                    >
                      <FormLabel>{t('dataset:hype_enhanced_index')}</FormLabel>
                    </Checkbox>
                  </MyTooltip>
                  <QuestionTip label={t('dataset:hype_enhanced_index_tips')} />
                  <MyTooltip label={t('dataset:config_prompt')}>
                    <MyIcon
                      name={'common/settingLight'}
                      w={'16px'}
                      cursor={'pointer'}
                      color={'myGray.500'}
                      _hover={{ color: 'primary.500' }}
                      onClick={() => handleOpenConfigPrompt('hypeIndexes')}
                    />
                  </MyTooltip>
                </HStack>
                <HStack flex={'1'} spacing={1}>
                  <MyTooltip
                    label={
                      !feConfigs?.isPlus
                        ? t('common:commercial_function_tip')
                        : !datasetDetail?.vlmModel
                          ? t('common:error_vlm_not_config')
                          : ''
                    }
                  >
                    <Checkbox
                      isDisabled={!feConfigs?.isPlus || !datasetDetail?.vlmModel}
                      isChecked={imageIndex}
                      onChange={(e) => setImageIndex(e.target.checked)}
                    >
                      <FormLabel>{t('dataset:image_auto_parse')}</FormLabel>
                    </Checkbox>
                  </MyTooltip>
                  <QuestionTip label={t('dataset:image_auto_parse_tips')} />
                  <MyTooltip label={t('dataset:config_prompt')}>
                    <MyIcon
                      name={'common/settingLight'}
                      w={'16px'}
                      cursor={'pointer'}
                      color={'myGray.500'}
                      _hover={{ color: 'primary.500' }}
                      onClick={() => handleOpenConfigPrompt('imageIndex')}
                    />
                  </MyTooltip>
                </HStack>
              </Grid>
            </Box>
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

      {/* Config Prompt Modal */}
      {isOpenConfigPrompt && (
        <ConfigPromptModal
          isOpen={isOpenConfigPrompt}
          onClose={onCloseConfigPrompt}
          defaultValue=""
          onSuccess={handleSavePrompt}
        />
      )}
    </MyModal>
  );
};

export default TemplateImportModal;
