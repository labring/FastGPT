import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  BoxProps,
  useTheme,
  useDisclosure,
  Button,
  Image
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { useForm, useFieldArray } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { appModules2Form, getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import { chatModelList, simpleModeTemplates } from '@/web/common/system/staticData';
import { chatNodeSystemPromptTip, welcomeTextTip } from '@fastgpt/global/core/module/template/tip';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useAppStore } from '@/web/core/app/store/useAppStore';

import { postForm2Modules } from '@/web/core/app/utils';

import dynamic from 'next/dynamic';
import MySelect from '@/components/Select';
import MyTooltip from '@/components/MyTooltip';
import Avatar from '@/components/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { SimpleModeTemplate_FastGPT_Universal } from '@/global/core/app/constants';
import VariableEdit from '@/components/core/module/Flow/components/modules/VariableEdit';
import PromptTextarea from '@/components/common/Textarea/PromptTextarea/index';
import { DatasetSearchModeMap } from '@fastgpt/global/core/dataset/constant';
import SelectAiModel from '@/components/Select/SelectAiModel';

const DatasetSelectModal = dynamic(() => import('@/components/core/module/DatasetSelectModal'));
const DatasetParamsModal = dynamic(() => import('@/components/core/module/DatasetParamsModal'));
const AIChatSettingsModal = dynamic(() => import('@/components/core/module/AIChatSettingsModal'));
const TTSSelect = dynamic(
  () => import('@/components/core/module/Flow/components/modules/TTSSelect')
);
const QGSwitch = dynamic(() => import('@/components/core/module/Flow/components/modules/QGSwitch'));
const CfrEditModal = dynamic(() => import('./CfrEditModal'));

const EditForm = ({
  divRef,
  isSticky
}: {
  divRef: React.RefObject<HTMLDivElement>;
  isSticky: boolean;
}) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { appDetail, updateAppDetail } = useAppStore();
  const { loadAllDatasets, allDatasets } = useDatasetStore();
  const { isPc } = useSystemStore();
  const [refresh, setRefresh] = useState(false);

  const { register, setValue, getValues, reset, handleSubmit, control } =
    useForm<AppSimpleEditFormType>({
      defaultValues: getDefaultAppForm()
    });

  const { fields: datasets, replace: replaceKbList } = useFieldArray({
    control,
    name: 'dataset.datasets'
  });

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenDatasetParams,
    onOpen: onOpenDatasetParams,
    onClose: onCloseDatasetParams
  } = useDisclosure();
  const {
    isOpen: isOpenCfrModal,
    onOpen: onOpenCfrModal,
    onClose: onCloseCfrModal
  } = useDisclosure();

  const { openConfirm: openConfirmSave, ConfirmModal: ConfirmSaveModal } = useConfirm({
    content: t('core.app.edit.Confirm Save App Tip')
  });

  const chatModelSelectList = useMemo(() => {
    return chatModelList.map((item) => ({
      value: item.model,
      label: item.name
    }));
  }, [refresh]);

  const selectDatasets = useMemo(
    () => allDatasets.filter((item) => datasets.find((dataset) => dataset.datasetId === item._id)),
    [allDatasets, datasets]
  );

  const selectSimpleTemplate = useMemo(
    () =>
      simpleModeTemplates?.find((item) => item.id === getValues('templateId')) ||
      SimpleModeTemplate_FastGPT_Universal,
    [getValues, refresh]
  );

  const tokenLimit = useMemo(() => {
    return (
      chatModelList.find((item) => item.model === getValues('aiSettings.model'))?.quoteMaxToken ||
      3000
    );
  }, [getValues, refresh]);

  const datasetSearchMode = useMemo(() => {
    const mode = getValues('dataset.searchMode');
    if (!mode) return '';
    return t(DatasetSearchModeMap[mode]?.title);
  }, [getValues, t, refresh]);

  const { mutate: onSubmitSave, isLoading: isSaving } = useRequest({
    mutationFn: async (data: AppSimpleEditFormType) => {
      const modules = await postForm2Modules(data, data.templateId);

      await updateAppDetail(appDetail._id, {
        modules,
        type: AppTypeEnum.simple,
        simpleTemplateId: data.templateId,
        permission: undefined
      });
    },
    successToast: t('common.Save Success'),
    errorToast: t('common.Save Failed')
  });

  const appModule2Form = useCallback(() => {
    const formVal = appModules2Form({
      templateId: appDetail.simpleTemplateId,
      modules: appDetail.modules
    });

    reset(formVal);
    setTimeout(() => {
      setRefresh((state) => !state);
    }, 100);
  }, [appDetail.modules, appDetail.simpleTemplateId, reset]);

  useEffect(() => {
    appModule2Form();
  }, [appModule2Form]);
  useQuery(['loadAllDatasets'], loadAllDatasets);

  const BoxStyles: BoxProps = {
    px: 5,
    py: '16px',
    borderBottomWidth: '1px',
    borderBottomColor: 'borderColor.low'
  };
  const BoxBtnStyles: BoxProps = {
    cursor: 'pointer',
    px: 3,
    py: 1,
    borderRadius: 'md',
    _hover: {
      bg: 'myGray.150'
    }
  };
  const LabelStyles: BoxProps = {
    w: ['60px', '100px'],
    flexShrink: 0,
    fontSize: ['sm', 'md']
  };

  return (
    <Box>
      {/* title */}
      <Flex
        ref={divRef}
        position={'sticky'}
        top={-4}
        bg={'myGray.25'}
        py={4}
        justifyContent={'space-between'}
        alignItems={'center'}
        zIndex={10}
        px={4}
        {...(isSticky && {
          borderBottom: theme.borders.base,
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)'
        })}
      >
        <Flex alignItems={'center'}>
          <Box fontSize={['md', 'xl']} color={'myGray.800'}>
            {t('core.app.App params config')}
          </Box>
          <MyTooltip label={t('core.app.Simple Config Tip')} forceShow>
            <MyIcon name={'common/questionLight'} color={'myGray.500'} ml={2} />
          </MyTooltip>
        </Flex>
        <Button
          isLoading={isSaving}
          size={['sm', 'md']}
          variant={appDetail.type === AppTypeEnum.simple ? 'primary' : 'whitePrimary'}
          onClick={() => {
            if (appDetail.type !== AppTypeEnum.simple) {
              openConfirmSave(handleSubmit((data) => onSubmitSave(data)))();
            } else {
              handleSubmit((data) => onSubmitSave(data))();
            }
          }}
        >
          {isPc ? t('core.app.Save and preview') : t('common.Save')}
        </Button>
      </Flex>

      <Box px={4}>
        <Box bg={'white'} borderRadius={'md'} borderWidth={'1px'} borderColor={'borderColor.base'}>
          {/* simple mode select */}
          <Flex {...BoxStyles}>
            <Flex alignItems={'center'} flex={'1 0 0'}>
              <Image alt={''} src={'/imgs/module/templates.png'} w={'18px'} />
              <Box mx={2}>{t('core.app.simple.mode template select')}</Box>
            </Flex>
            <MySelect
              w={['200px', '250px']}
              list={
                simpleModeTemplates?.map((item) => ({
                  alias: item.name,
                  label: item.desc,
                  value: item.id
                })) || []
              }
              value={getValues('templateId')}
              onchange={(val) => {
                setValue('templateId', val);
                setRefresh(!refresh);
              }}
            />
          </Flex>

          {/* ai */}
          {selectSimpleTemplate?.systemForm?.aiSettings && (
            <Box {...BoxStyles}>
              <Flex alignItems={'center'}>
                <Image alt={''} src={'/imgs/module/AI.png'} w={'18px'} />
                <Box ml={2} flex={1}>
                  {t('app.AI Settings')}
                </Box>
                {(selectSimpleTemplate.systemForm.aiSettings.maxToken ||
                  selectSimpleTemplate.systemForm.aiSettings.temperature ||
                  selectSimpleTemplate.systemForm.aiSettings.quoteTemplate ||
                  selectSimpleTemplate.systemForm.aiSettings.quotePrompt) && (
                  <Flex {...BoxBtnStyles} onClick={onOpenAIChatSetting}>
                    <MyIcon mr={1} name={'common/settingLight'} w={'14px'} />
                    {t('app.Open AI Advanced Settings')}
                  </Flex>
                )}
              </Flex>
              {selectSimpleTemplate.systemForm.aiSettings?.model && (
                <Flex alignItems={'center'} mt={5}>
                  <Box {...LabelStyles}>{t('core.ai.Model')}</Box>
                  <Box flex={'1 0 0'}>
                    <SelectAiModel
                      width={'100%'}
                      value={getValues(`aiSettings.model`)}
                      list={chatModelSelectList}
                      onchange={(val: any) => {
                        setValue('aiSettings.model', val);
                        const maxToken =
                          chatModelList.find((item) => item.model === getValues('aiSettings.model'))
                            ?.maxResponse || 4000;
                        const token = maxToken / 2;
                        setValue('aiSettings.maxToken', token);
                        setRefresh(!refresh);
                      }}
                    />
                  </Box>
                </Flex>
              )}

              {selectSimpleTemplate.systemForm.aiSettings?.systemPrompt && (
                <Flex mt={10} alignItems={'flex-start'}>
                  <Box {...LabelStyles}>
                    {t('core.ai.Prompt')}
                    <MyTooltip label={chatNodeSystemPromptTip} forceShow>
                      <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
                    </MyTooltip>
                  </Box>
                  <PromptTextarea
                    flex={1}
                    bg={'myWhite.400'}
                    rows={5}
                    placeholder={chatNodeSystemPromptTip}
                    defaultValue={getValues('aiSettings.systemPrompt')}
                    onBlur={(e) => {
                      setValue('aiSettings.systemPrompt', e.target.value || '');
                    }}
                  />
                </Flex>
              )}
            </Box>
          )}

          {/* dataset */}
          {selectSimpleTemplate?.systemForm?.dataset && (
            <Box {...BoxStyles}>
              <Flex alignItems={'center'}>
                <Flex alignItems={'center'} flex={1}>
                  <Image alt={''} src={'/imgs/module/db.png'} w={'18px'} />
                  <Box ml={2}>{t('core.dataset.Choose Dataset')}</Box>
                </Flex>
                {selectSimpleTemplate.systemForm.dataset.datasets && (
                  <Flex alignItems={'center'} {...BoxBtnStyles} onClick={onOpenKbSelect}>
                    <SmallAddIcon />
                    {t('common.Choose')}
                  </Flex>
                )}
                {(selectSimpleTemplate.systemForm.dataset.limit ||
                  selectSimpleTemplate.systemForm.dataset.searchMode ||
                  selectSimpleTemplate.systemForm.dataset.searchEmptyText ||
                  selectSimpleTemplate.systemForm.dataset.similarity) && (
                  <Flex
                    alignItems={'center'}
                    ml={3}
                    {...BoxBtnStyles}
                    onClick={onOpenDatasetParams}
                  >
                    <MyIcon name={'edit'} w={'14px'} mr={1} />
                    {t('common.Params')}
                  </Flex>
                )}
              </Flex>
              {getValues('dataset.datasets').length > 0 && (
                <Flex mt={1} color={'myGray.600'} fontSize={'sm'} mb={2}>
                  {t('core.dataset.search.search mode')}: {datasetSearchMode}
                  {', '}
                  {t('core.dataset.search.Min Similarity')}: {getValues('dataset.similarity')}
                  {', '}
                  {t('core.dataset.search.Max Tokens')}: {getValues('dataset.limit')}
                  {getValues('dataset.searchEmptyText') === ''
                    ? ''
                    : t('core.dataset.Set Empty Result Tip')}
                </Flex>
              )}
              <Grid
                gridTemplateColumns={['repeat(2, minmax(0, 1fr))', 'repeat(3, minmax(0, 1fr))']}
                gridGap={[2, 4]}
              >
                {selectDatasets.map((item) => (
                  <MyTooltip key={item._id} label={t('core.dataset.Read Dataset')}>
                    <Flex
                      overflow={'hidden'}
                      alignItems={'center'}
                      p={2}
                      bg={'white'}
                      boxShadow={
                        '0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'
                      }
                      borderRadius={'md'}
                      border={theme.borders.base}
                      cursor={'pointer'}
                      onClick={() =>
                        router.push({
                          pathname: '/dataset/detail',
                          query: {
                            datasetId: item._id
                          }
                        })
                      }
                    >
                      <Avatar src={item.avatar} w={'18px'} mr={1} />
                      <Box flex={'1 0 0'} w={0} className={'textEllipsis'} fontSize={'sm'}>
                        {item.name}
                      </Box>
                    </Flex>
                  </MyTooltip>
                ))}
              </Grid>
            </Box>
          )}

          {/* cfr */}
          {selectSimpleTemplate?.systemForm?.cfr && getValues('dataset.datasets').length > 0 && (
            <Flex {...BoxStyles} alignItems={'center'}>
              <Image src={'/imgs/module/cfr.svg'} alt={''} w={'18px'} />
              <Box ml={2}>{t('core.module.template.cfr')}</Box>
              <MyTooltip label={t('core.module.template.cfr intro')} forceShow>
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
              <Box flex={1} />
              <Flex {...BoxBtnStyles} onClick={onOpenCfrModal}>
                {getValues('cfr.background') === 'none' ? t('common.Not open') : t('common.Opened')}
              </Flex>
            </Flex>
          )}

          {/* variable */}
          {selectSimpleTemplate?.systemForm?.userGuide?.variables && (
            <Box {...BoxStyles}>
              <VariableEdit
                variables={getValues('userGuide.variables')}
                onChange={(e) => {
                  setValue('userGuide.variables', e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          )}

          {/* welcome */}
          {selectSimpleTemplate?.systemForm?.userGuide?.welcomeText && (
            <Box {...BoxStyles}>
              <Flex alignItems={'center'}>
                <Image alt={''} src={'/imgs/module/userGuide.png'} w={'18px'} />
                <Box mx={2}>{t('core.app.Welcome Text')}</Box>
                <MyTooltip label={welcomeTextTip} forceShow>
                  <QuestionOutlineIcon />
                </MyTooltip>
              </Flex>
              <PromptTextarea
                mt={2}
                bg={'myWhite.400'}
                rows={5}
                placeholder={welcomeTextTip}
                defaultValue={getValues('userGuide.welcomeText')}
                onBlur={(e) => {
                  setValue('userGuide.welcomeText', e.target.value || '');
                }}
              />
            </Box>
          )}

          {/* tts */}
          {selectSimpleTemplate?.systemForm?.userGuide?.tts && (
            <Box {...BoxStyles}>
              <TTSSelect
                value={getValues('userGuide.tts')}
                onChange={(e) => {
                  setValue('userGuide.tts', e);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          )}

          {/* question guide */}
          {selectSimpleTemplate?.systemForm?.userGuide?.questionGuide && (
            <Box {...BoxStyles} borderBottom={'none'}>
              <QGSwitch
                isChecked={getValues('userGuide.questionGuide')}
                size={'lg'}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue('userGuide.questionGuide', value);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          )}
        </Box>
      </Box>

      <ConfirmSaveModal bg={appDetail.type === AppTypeEnum.simple ? '' : 'red.600'} countDown={5} />
      {isOpenAIChatSetting && (
        <AIChatSettingsModal
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            setValue('aiSettings', e);
            onCloseAIChatSetting();
          }}
          defaultData={getValues('aiSettings')}
          simpleModeTemplate={selectSimpleTemplate}
        />
      )}
      {isOpenDatasetSelect && (
        <DatasetSelectModal
          isOpen={isOpenDatasetSelect}
          defaultSelectedDatasets={selectDatasets.map((item) => ({
            datasetId: item._id,
            vectorModel: item.vectorModel
          }))}
          onClose={onCloseKbSelect}
          onChange={replaceKbList}
        />
      )}
      {isOpenDatasetParams && (
        <DatasetParamsModal
          // {...getValues('dataset')}
          searchMode={getValues('dataset.searchMode')}
          searchEmptyText={
            selectSimpleTemplate?.systemForm?.dataset?.searchEmptyText
              ? getValues('dataset.searchEmptyText')
              : undefined
          }
          limit={
            selectSimpleTemplate?.systemForm?.dataset?.limit
              ? getValues('dataset.limit')
              : undefined
          }
          similarity={
            selectSimpleTemplate?.systemForm?.dataset?.similarity
              ? getValues('dataset.similarity')
              : undefined
          }
          usingReRank={
            selectSimpleTemplate?.systemForm?.dataset?.usingReRank
              ? getValues('dataset.usingReRank')
              : undefined
          }
          maxTokens={tokenLimit}
          onClose={onCloseDatasetParams}
          onSuccess={(e) => {
            setValue('dataset', {
              ...getValues('dataset'),
              ...e
            });

            setRefresh((state) => !state);
          }}
        />
      )}
      {isOpenCfrModal && (
        <CfrEditModal
          onClose={onCloseCfrModal}
          defaultValue={getValues('cfr.background')}
          onFinish={(e) => {
            setValue('cfr.background', e);
          }}
        />
      )}
    </Box>
  );
};

export default React.memo(EditForm);
