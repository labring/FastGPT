import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Flex,
  ModalBody,
  ModalFooter,
  Switch,
  Textarea,
  useTheme
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import MySlider from '@/components/Slider';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constants';
import MyRadio from '@/components/common/MyRadio';
import MyIcon from '@fastgpt/web/components/common/Icon';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import SelectAiModel from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import { defaultDatasetMaxTokens } from '@fastgpt/global/core/app/constants';

export type DatasetParamsProps = {
  searchMode: `${DatasetSearchModeEnum}`;
  limit?: number;
  similarity?: number;
  usingReRank?: boolean;
  datasetSearchUsingExtensionQuery?: boolean;
  datasetSearchExtensionModel?: string;
  datasetSearchExtensionBg?: string;

  maxTokens?: number; // limit max tokens
};
enum SearchSettingTabEnum {
  searchMode = 'searchMode',
  limit = 'limit',
  queryExtension = 'queryExtension'
}

const DatasetParamsModal = ({
  searchMode = DatasetSearchModeEnum.embedding,
  limit,
  similarity,
  usingReRank,
  maxTokens = defaultDatasetMaxTokens,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModel,
  datasetSearchExtensionBg,
  onClose,
  onSuccess
}: DatasetParamsProps & { onClose: () => void; onSuccess: (e: DatasetParamsProps) => void }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { toast } = useToast();
  const { teamPlanStatus } = useUserStore();
  const { reRankModelList, llmModelList } = useSystemStore();
  const [refresh, setRefresh] = useState(false);
  const [currentTabType, setCurrentTabType] = useState(SearchSettingTabEnum.searchMode);

  const chatModelSelectList = (() =>
    llmModelList
      .filter((model) => model.usedInQueryExtension)
      .map((item) => ({
        value: item.model,
        label: item.name
      })))();

  const { register, setValue, getValues, handleSubmit, watch } = useForm<DatasetParamsProps>({
    defaultValues: {
      limit,
      similarity,
      searchMode,
      usingReRank: !!usingReRank && teamPlanStatus?.standardConstants?.permissionReRank !== false,
      datasetSearchUsingExtensionQuery,
      datasetSearchExtensionModel: datasetSearchExtensionModel || chatModelSelectList[0]?.value,
      datasetSearchExtensionBg
    }
  });
  const datasetSearchUsingCfrForm = watch('datasetSearchUsingExtensionQuery');
  const queryExtensionModel = watch('datasetSearchExtensionModel');
  const cfbBgDesc = watch('datasetSearchExtensionBg');
  const usingReRankWatch = watch('usingReRank');
  const searchModeWatch = watch('searchMode');

  const searchModeList = useMemo(() => {
    const list = Object.values(DatasetSearchModeMap);
    return list;
  }, []);

  const showSimilarity = useMemo(() => {
    if (similarity === undefined) return false;
    if (usingReRankWatch) return true;
    if (searchModeWatch === DatasetSearchModeEnum.embedding) return true;
    return false;
  }, [searchModeWatch, similarity, usingReRankWatch]);

  const showReRank = useMemo(() => {
    return usingReRank !== undefined && reRankModelList.length > 0;
  }, [reRankModelList.length, usingReRank]);

  useEffect(() => {
    if (datasetSearchUsingCfrForm) {
      !queryExtensionModel &&
        setValue('datasetSearchExtensionModel', chatModelSelectList[0]?.value);
    } else {
      setValue('datasetSearchExtensionModel', '');
    }
  }, [chatModelSelectList, datasetSearchUsingCfrForm, queryExtensionModel, setValue]);

  // 保证只有 80 左右个刻度。
  const maxTokenStep = useMemo(() => {
    if (maxTokens < 8000) return 80;
    return Math.ceil(maxTokens / 80 / 100) * 100;
  }, [maxTokens]);

  return (
    <MyModal
      isOpen={true}
      onClose={onClose}
      iconSrc="/imgs/modal/params.svg"
      title={t('common:core.dataset.search.Dataset Search Params')}
      w={['90vw', '550px']}
    >
      <ModalBody flex={'auto'} overflow={'auto'}>
        <LightRowTabs<SearchSettingTabEnum>
          width={'100%'}
          mb={3}
          list={[
            {
              icon: 'modal/setting',
              label: t('common:core.dataset.search.search mode'),
              value: SearchSettingTabEnum.searchMode
            },
            {
              icon: 'support/outlink/apikeyFill',
              label: t('common:core.dataset.search.Filter'),
              value: SearchSettingTabEnum.limit
            },
            {
              label: t('common:core.module.template.Query extension'),
              value: SearchSettingTabEnum.queryExtension,
              icon: '/imgs/workflow/cfr.svg'
            }
          ]}
          value={currentTabType}
          onChange={setCurrentTabType}
        />
        {currentTabType === SearchSettingTabEnum.searchMode && (
          <>
            <MyRadio
              gridGap={2}
              gridTemplateColumns={'repeat(1,1fr)'}
              list={searchModeList}
              value={getValues('searchMode')}
              onChange={(e) => {
                setValue('searchMode', e as `${DatasetSearchModeEnum}`);
                setRefresh(!refresh);
              }}
            />
            <>
              <Divider my={4} />
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                userSelect={'none'}
                py={3}
                px={4}
                border={theme.borders.sm}
                borderWidth={'1.5px'}
                borderRadius={'md'}
                position={'relative'}
                {...(getValues('usingReRank')
                  ? {
                      borderColor: 'primary.400'
                    }
                  : {})}
                onClick={(e) => {
                  if (!showReRank) {
                    return toast({
                      status: 'warning',
                      title: t('common:core.ai.Not deploy rerank model')
                    });
                  }
                  if (
                    teamPlanStatus?.standardConstants &&
                    !teamPlanStatus?.standardConstants?.permissionReRank
                  ) {
                    return toast({
                      status: 'warning',
                      title: t('common:support.team.limit.No permission rerank')
                    });
                  }
                  setValue('usingReRank', !getValues('usingReRank'));
                  setRefresh((state) => !state);
                }}
              >
                <MyIcon name="core/dataset/rerank" w={'18px'} mr={'14px'} />
                <Box pr={2} color={'myGray.800'} flex={'1 0 0'}>
                  <Box fontSize={'sm'}>{t('common:core.dataset.search.ReRank')}</Box>
                  <Box fontSize={'xs'} color={'myGray.500'}>
                    {t('common:core.dataset.search.ReRank desc')}
                  </Box>
                </Box>
                <Box position={'relative'} w={'18px'} h={'18px'}>
                  <Checkbox colorScheme="primary" isChecked={getValues('usingReRank')} size="lg" />
                  <Box position={'absolute'} top={0} right={0} bottom={0} left={0} zIndex={1}></Box>
                </Box>
              </Flex>
            </>
          </>
        )}
        {currentTabType === SearchSettingTabEnum.limit && (
          <Box pt={5}>
            {limit !== undefined && (
              <Box display={['block', 'flex']}>
                <Flex flex={'0 0 120px'} mb={[8, 0]}>
                  <FormLabel>{t('common:core.dataset.search.Max Tokens')}</FormLabel>
                  <QuestionTip
                    ml={1}
                    label={t('common:core.dataset.search.Max Tokens Tips')}
                  ></QuestionTip>
                </Flex>
                <Box flex={1} mx={4}>
                  <MySlider
                    markList={[
                      { label: '100', value: 100 },
                      { label: maxTokens, value: maxTokens }
                    ]}
                    min={100}
                    max={maxTokens}
                    step={maxTokenStep}
                    value={getValues(NodeInputKeyEnum.datasetMaxTokens) ?? 1000}
                    onChange={(val) => {
                      setValue(NodeInputKeyEnum.datasetMaxTokens, val);
                      setRefresh(!refresh);
                    }}
                  />
                </Box>
              </Box>
            )}
            <Box display={['block', 'flex']} mt={10}>
              <Flex flex={'0 0 120px'} mb={[8, 0]}>
                <FormLabel>{t('common:core.dataset.search.Min Similarity')}</FormLabel>
                <QuestionTip
                  ml={1}
                  label={t('common:core.dataset.search.Min Similarity Tips')}
                ></QuestionTip>
              </Flex>
              <Box flex={1} mx={4}>
                {showSimilarity ? (
                  <MySlider
                    markList={[
                      { label: '0', value: 0 },
                      { label: '1', value: 1 }
                    ]}
                    min={0}
                    max={1}
                    step={0.01}
                    value={getValues(NodeInputKeyEnum.datasetSimilarity) ?? 0.5}
                    onChange={(val) => {
                      setValue(NodeInputKeyEnum.datasetSimilarity, val);
                      setRefresh(!refresh);
                    }}
                  />
                ) : (
                  <Box color={'myGray.500'}>
                    {t('common:core.dataset.search.No support similarity')}
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )}
        {currentTabType === SearchSettingTabEnum.queryExtension && (
          <Box>
            <Box transform={'translateY(-5px)'} fontSize={'xs'} color={'myGray.500'}>
              {t('common:core.dataset.Query extension intro')}
            </Box>
            <Flex mt={3} alignItems={'center'}>
              <FormLabel flex={'1 0 0'}>
                {t('common:core.dataset.search.Using query extension')}
              </FormLabel>
              <Switch {...register('datasetSearchUsingExtensionQuery')} />
            </Flex>
            {datasetSearchUsingCfrForm === true && (
              <>
                <Flex mt={4} alignItems={'center'}>
                  <FormLabel flex={['0 0 80px', '1 0 0']}>{t('common:core.ai.Model')}</FormLabel>
                  <Box flex={['1 0 0', '0 0 300px']}>
                    <SelectAiModel
                      width={'100%'}
                      value={queryExtensionModel}
                      list={chatModelSelectList}
                      onchange={(val: any) => {
                        setValue('datasetSearchExtensionModel', val);
                      }}
                    />
                  </Box>
                </Flex>
                <Box mt={3}>
                  <Flex alignItems={'center'}>
                    <FormLabel>
                      {t('common:core.app.edit.Query extension background prompt')}
                    </FormLabel>
                    <QuestionTip
                      ml={1}
                      label={t('common:core.app.edit.Query extension background tip')}
                    ></QuestionTip>
                  </Flex>
                  <Box mt={1}>
                    <MyTextarea
                      autoHeight
                      minH={150}
                      maxH={300}
                      placeholder={t('common:core.module.QueryExtension.placeholder')}
                      {...register('datasetSearchExtensionBg')}
                    />
                  </Box>
                </Box>
              </>
            )}
          </Box>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button
          onClick={() => {
            onClose();
            handleSubmit(onSuccess)();
          }}
        >
          {t('common:common.Done')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default DatasetParamsModal;
