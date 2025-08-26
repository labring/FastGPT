import React, { useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  Checkbox,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { shadowLight } from '@fastgpt/web/styles/theme';
import CollectionChunkForm from '../../Form/CollectionChunkForm';
import { usePdfParsers } from '@/web/common/system/hooks/usePdfParsers';
import MySelect from '@fastgpt/web/components/common/MySelect';

function DataProcess() {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { goToNext, processParamsForm } = useContextSelector(DatasetImportContext, (v) => v);
  const { register, watch, setValue } = processParamsForm;
  const customPdfParseValue = watch('customPdfParse');
  const { data: pdfParsers = [] } = usePdfParsers();

  // 构建选择器列表
  const pdfParserOptions = [
    {
      label: t('dataset:system_default_parser'),
      value: '',
      description: t('dataset:system_default_parser_desc')
    },
    ...pdfParsers.map((parser) => ({
      label: parser.label,
      value: parser.value,
      description: parser.desc
    }))
  ];

  const Title = useCallback(({ title }: { title: string }) => {
    return (
      <AccordionButton bg={'none !important'} p={2}>
        <Box w={'3px'} h={'16px'} bg={'primary.600'} borderRadius={'2px'} mr={2} />
        <Box color={'myGray.900'} flex={'1 0 0'} textAlign={'left'}>
          {title}
        </Box>
        <AccordionIcon />
      </AccordionButton>
    );
  }, []);

  const showFileParseSetting = feConfigs?.showCustomPdfParse;

  return (
    <>
      <Box flex={'1 0 0'} maxW={['90vw', '640px']} m={'auto'} overflow={'auto'}>
        <Accordion allowMultiple reduceMotion defaultIndex={[0, 1, 2]}>
          {showFileParseSetting && (
            <AccordionItem border={'none'} borderBottom={'base'} pb={4}>
              <Title title={t('dataset:import_file_parse_setting')} />

              <AccordionPanel p={2}>
                <Flex
                  flexDirection={'column'}
                  gap={3}
                  border={'1px solid'}
                  borderColor={'primary.600'}
                  borderRadius={'md'}
                  boxShadow={shadowLight}
                  p={4}
                >
                  {feConfigs.showCustomPdfParse && (
                    <Box>
                      <HStack spacing={1} mb={3}>
                        <FormLabel>{t('dataset:pdf_enhance_parse')}</FormLabel>
                        <QuestionTip label={t('dataset:pdf_enhance_parse_tips')} />
                      </HStack>
                      <MySelect
                        value={customPdfParseValue || ''}
                        list={pdfParserOptions}
                        onChange={(val) => setValue('customPdfParse', val)}
                        size={'sm'}
                        h={'32px'}
                      />
                      {customPdfParseValue && feConfigs?.show_pay && (
                        <MyTag
                          type={'borderSolid'}
                          borderColor={'myGray.200'}
                          bg={'myGray.100'}
                          color={'primary.600'}
                          py={1.5}
                          borderRadius={'md'}
                          px={3}
                          whiteSpace={'wrap'}
                          mt={2}
                        >
                          {t('dataset:pdf_enhance_parse_price', {
                            price:
                              pdfParsers.find((p) => p.value === customPdfParseValue)?.price || 0
                          })}
                        </MyTag>
                      )}
                    </Box>
                  )}
                </Flex>
              </AccordionPanel>
            </AccordionItem>
          )}

          <AccordionItem mt={4} border={'none'}>
            <Title title={t('dataset:import_data_process_setting')} />

            <AccordionPanel p={2}>
              {/* @ts-ignore */}
              <CollectionChunkForm form={processParamsForm} />
            </AccordionPanel>
          </AccordionItem>

          <Flex mt={5} gap={3} justifyContent={'flex-end'}>
            <Button
              onClick={() => {
                goToNext();
              }}
            >
              {t('common:next_step')}
            </Button>
          </Flex>
        </Accordion>
      </Box>
    </>
  );
}

export default React.memo(DataProcess);
