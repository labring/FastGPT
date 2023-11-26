import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  BoxProps,
  Textarea,
  useTheme,
  useDisclosure,
  Button,
  IconButton,
  Image
} from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useQuery } from '@tanstack/react-query';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { useForm, useFieldArray } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { appModules2Form, getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import { chatModelList, simpleModeTemplates } from '@/web/common/system/staticData';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { chatNodeSystemPromptTip, welcomeTextTip } from '@fastgpt/global/core/module/template/tip';
import type { VariableItemType } from '@fastgpt/global/core/module/type.d';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { streamFetch } from '@/web/common/api/fetch';
import { useRouter } from 'next/router';
import { useToast } from '@/web/common/hooks/useToast';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { delModelById } from '@/web/core/app/api';
import { useTranslation } from 'next-i18next';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { DatasetParamsModal } from '@/components/core/module/DatasetSelectModal';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import PermissionIconText from '@/components/support/permission/IconText';

import { checkChatSupportSelectFileByModules } from '@/web/core/chat/utils';
import { useSticky } from '@/web/common/hooks/useSticky';
import { postForm2Modules } from '@/web/core/app/utils';

import dynamic from 'next/dynamic';
import MySelect from '@/components/Select';
import MyTooltip from '@/components/MyTooltip';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import { SimpleModeTemplate_FastGPT_Universal } from '@/global/core/app/constants';
import QGSwitch from '@/components/core/module/Flow/components/modules/QGSwitch';
import TTSSelect from '@/components/core/module/Flow/components/modules/TTSSelect';
import VariableEdit from '@/components/core/module/Flow/components/modules/VariableEdit';

const InfoModal = dynamic(() => import('../InfoModal'));
const DatasetSelectModal = dynamic(() => import('@/components/core/module/DatasetSelectModal'));
const AIChatSettingsModal = dynamic(() => import('@/components/core/module/AIChatSettingsModal'));

function ConfigForm({
  divRef,
  isSticky
}: {
  divRef: React.RefObject<HTMLDivElement>;
  isSticky: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { appDetail, updateAppDetail } = useAppStore();
  const { loadAllDatasets, allDatasets } = useDatasetStore();
  const { isPc } = useSystemStore();
  const [editVariable, setEditVariable] = useState<VariableItemType>();
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
    onOpen: onOpenKbParams,
    onClose: onCloseKbParams
  } = useDisclosure();

  const { openConfirm: openConfirmSave, ConfirmModal: ConfirmSaveModal } = useConfirm({
    content: t('app.Confirm Save App Tip'),
    bg: appDetail.type === AppTypeEnum.simple ? '' : 'red.600'
  });

  const chatModelSelectList = useMemo(() => {
    return chatModelList.map((item) => ({
      value: item.model,
      label: `${item.name} (${formatPrice(item.price, 1000)} 元/1k tokens)`
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
    bg: 'myWhite.200',
    px: 4,
    py: 3,
    borderRadius: 'lg',
    border: theme.borders.base
  };
  const BoxBtnStyles: BoxProps = {
    cursor: 'pointer',
    px: 3,
    py: '2px',
    borderRadius: 'md',
    _hover: {
      bg: 'myGray.200'
    }
  };
  const LabelStyles: BoxProps = {
    w: ['60px', '100px'],
    flexShrink: 0,
    fontSize: ['sm', 'md']
  };

  return (
    <Box mt={2}>
      {/* title */}
      <Flex
        ref={divRef}
        position={'sticky'}
        top={-4}
        bg={'white'}
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
        <Box fontSize={['md', 'xl']} fontWeight={'bold'}>
          应用配置
          <MyTooltip label={'仅包含基础功能，复杂 agent 功能请使用高级编排。'} forceShow>
            <QuestionOutlineIcon ml={2} fontSize={'md'} />
          </MyTooltip>
        </Box>
        <Button
          isLoading={isSaving}
          fontSize={'sm'}
          size={['sm', 'md']}
          variant={appDetail.type === AppTypeEnum.simple ? 'primary' : 'base'}
          onClick={() => {
            if (appDetail.type !== AppTypeEnum.simple) {
              openConfirmSave(handleSubmit((data) => onSubmitSave(data)))();
            } else {
              handleSubmit((data) => onSubmitSave(data))();
            }
          }}
        >
          {isPc ? '保存并预览' : '保存'}
        </Button>
      </Flex>

      <Box px={4}>
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

        {/* welcome */}
        {selectSimpleTemplate?.systemForm?.userGuide?.welcomeText && (
          <Box {...BoxStyles} mt={2}>
            <Flex alignItems={'center'}>
              <Image alt={''} src={'/imgs/module/userGuide.png'} w={'18px'} />
              <Box mx={2}>对话开场白</Box>
              <MyTooltip label={welcomeTextTip} forceShow>
                <QuestionOutlineIcon />
              </MyTooltip>
            </Flex>
            <Textarea
              mt={2}
              rows={5}
              placeholder={welcomeTextTip}
              borderColor={'myGray.100'}
              {...register('userGuide.welcomeText')}
            />
          </Box>
        )}

        {/* variable */}
        {selectSimpleTemplate?.systemForm?.userGuide?.variables && (
          <Box mt={2} {...BoxStyles}>
            <VariableEdit
              variables={getValues('userGuide.variables')}
              onChange={(e) => {
                setValue('userGuide.variables', e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        )}

        {/* ai */}
        {selectSimpleTemplate?.systemForm?.aiSettings && (
          <Box mt={5} {...BoxStyles}>
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
                  <MyIcon mr={1} name={'settingLight'} w={'14px'} />
                  {t('app.Open AI Advanced Settings')}
                </Flex>
              )}
            </Flex>
            {selectSimpleTemplate.systemForm.aiSettings?.model && (
              <Flex alignItems={'center'} mt={5}>
                <Box {...LabelStyles}>{t('core.ai.Model')}</Box>
                <Box flex={'1 0 0'}>
                  <MySelect
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
                <Textarea
                  rows={5}
                  minH={'60px'}
                  placeholder={chatNodeSystemPromptTip}
                  borderColor={'myGray.100'}
                  {...register('aiSettings.systemPrompt')}
                ></Textarea>
              </Flex>
            )}
          </Box>
        )}

        {/* dataset */}
        {selectSimpleTemplate?.systemForm?.dataset && (
          <Box mt={5} {...BoxStyles}>
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
                selectSimpleTemplate.systemForm.dataset.rerank ||
                selectSimpleTemplate.systemForm.dataset.searchEmptyText ||
                selectSimpleTemplate.systemForm.dataset.similarity) && (
                <Flex alignItems={'center'} ml={3} {...BoxBtnStyles} onClick={onOpenKbParams}>
                  <MyIcon name={'edit'} w={'14px'} mr={1} />
                  {t('common.Params')}
                </Flex>
              )}
            </Flex>
            <Flex mt={1} color={'myGray.600'} fontSize={['sm', 'md']}>
              {t('core.dataset.Similarity')}: {getValues('dataset.similarity')},{' '}
              {t('core.dataset.Search Top K')}: {getValues('dataset.limit')}
              {getValues('dataset.searchEmptyText') === ''
                ? ''
                : t('core.dataset.Set Empty Result Tip')}
            </Flex>
            <Grid
              gridTemplateColumns={['repeat(2, minmax(0, 1fr))', 'repeat(3, minmax(0, 1fr))']}
              my={2}
              gridGap={[2, 4]}
            >
              {selectDatasets.map((item) => (
                <MyTooltip key={item._id} label={t('core.dataset.Read Dataset')}>
                  <Flex
                    overflow={'hidden'}
                    alignItems={'center'}
                    p={2}
                    bg={'white'}
                    boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
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

        {/* tts */}
        {selectSimpleTemplate?.systemForm?.userGuide?.tts && (
          <Box mt={5} {...BoxStyles}>
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
          <Box mt={5} {...BoxStyles}>
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

      <ConfirmSaveModal />
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
          {...getValues('dataset')}
          onClose={onCloseKbParams}
          onChange={(e) => {
            setValue('dataset', {
              ...getValues('dataset'),
              ...e
            });

            setRefresh((state) => !state);
          }}
        />
      )}
    </Box>
  );
}

function Settings({ appId }: { appId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { parentRef, divRef, isSticky } = useSticky();
  const { appDetail } = useAppStore();
  const [settingAppInfo, setSettingAppInfo] = useState<AppSchema>();

  const { openConfirm: openConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: t('app.Confirm Del App Tip')
  });

  /* 点击删除 */
  const { mutate: handleDelModel, isLoading } = useRequest({
    mutationFn: async () => {
      if (!appDetail) return null;
      await delModelById(appDetail._id);
      return 'success';
    },
    onSuccess(res) {
      if (!res) return;
      toast({
        title: t('common.Delete Success'),
        status: 'success'
      });
      router.replace(`/app/list`);
    },
    errorToast: t('common.Delete Failed')
  });

  return (
    <Box
      ref={parentRef}
      h={'100%'}
      borderRight={'1.5px solid'}
      borderColor={'myGray.200'}
      pt={[0, 4]}
      pb={10}
      overflow={'overlay'}
    >
      <Box px={4}>
        <Flex alignItems={'flex-end'}>
          <Box fontSize={['md', 'xl']} fontWeight={'bold'}>
            <PermissionIconText permission={appDetail.permission} />
          </Box>
          <Box ml={1} color={'myGray.500'} fontSize={'sm'}>
            (AppId:{' '}
            <Box as={'span'} userSelect={'all'}>
              {appId}
            </Box>
            )
          </Box>
        </Flex>
        {/* basic info */}
        <Box
          border={theme.borders.base}
          borderRadius={'lg'}
          mt={2}
          px={5}
          py={4}
          bg={'myBlue.100'}
          position={'relative'}
        >
          <Flex alignItems={'center'} py={2}>
            <Avatar src={appDetail.avatar} borderRadius={'md'} w={'28px'} />
            <Box ml={3} fontWeight={'bold'} fontSize={'lg'}>
              {appDetail.name}
            </Box>
            {appDetail.isOwner && (
              <IconButton
                className="delete"
                position={'absolute'}
                top={4}
                right={4}
                size={'sm'}
                icon={<MyIcon name={'delete'} w={'14px'} />}
                variant={'base'}
                borderRadius={'md'}
                aria-label={'delete'}
                _hover={{
                  bg: 'myGray.100',
                  color: 'red.600'
                }}
                isLoading={isLoading}
                onClick={openConfirmDel(handleDelModel)}
              />
            )}
          </Flex>
          <Box
            flex={1}
            my={2}
            className={'textEllipsis3'}
            wordBreak={'break-all'}
            color={'myGray.600'}
          >
            {appDetail.intro || '快来给应用一个介绍~'}
          </Box>
          <Flex>
            <Button
              size={['sm', 'md']}
              variant={'base'}
              leftIcon={<MyIcon name={'chat'} w={'16px'} />}
              onClick={() => router.push(`/chat?appId=${appId}`)}
            >
              对话
            </Button>
            <Button
              mx={3}
              size={['sm', 'md']}
              variant={'base'}
              leftIcon={<MyIcon name={'shareLight'} w={'16px'} />}
              onClick={() => {
                router.replace({
                  query: {
                    appId,
                    currentTab: 'outLink'
                  }
                });
              }}
            >
              外接
            </Button>
            {appDetail.isOwner && (
              <Button
                size={['sm', 'md']}
                variant={'base'}
                leftIcon={<MyIcon name={'settingLight'} w={'16px'} />}
                onClick={() => setSettingAppInfo(appDetail)}
              >
                设置
              </Button>
            )}
          </Flex>
        </Box>
      </Box>
      {/* config form */}
      <ConfigForm divRef={divRef} isSticky={isSticky} />

      <ConfirmDelModal />
      {settingAppInfo && (
        <InfoModal defaultApp={settingAppInfo} onClose={() => setSettingAppInfo(undefined)} />
      )}
    </Box>
  );
}

function ChatTest({ appId }: { appId: string }) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { appDetail } = useAppStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const [modules, setModules] = useState<ModuleItemType[]>([]);

  const startChat = useCallback(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      const historyMaxLen =
        modules
          ?.find((item) => item.flowType === FlowNodeTypeEnum.historyNode)
          ?.inputs?.find((item) => item.key === 'maxContext')?.value || 0;
      const history = chatList.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/core/chat/chatTest',
        data: {
          history,
          prompt: chatList[chatList.length - 2].value,
          modules,
          variables,
          appId,
          appName: `调试-${appDetail.name}`
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      return { responseText, responseData };
    },
    [modules, appId, appDetail.name]
  );

  const resetChatBox = useCallback(() => {
    ChatBoxRef.current?.resetHistory([]);
    ChatBoxRef.current?.resetVariables();
  }, []);

  useEffect(() => {
    resetChatBox();
    setModules(appDetail.modules);
  }, [appDetail, resetChatBox]);

  return (
    <Flex position={'relative'} flexDirection={'column'} h={'100%'} py={4} overflowX={'auto'}>
      <Flex px={[2, 5]}>
        <Box fontSize={['md', 'xl']} fontWeight={'bold'} flex={1}>
          {t('app.Chat Debug')}
        </Box>
        <MyTooltip label={t('core.chat.Restart')}>
          <IconButton
            className="chat"
            size={'sm'}
            icon={<MyIcon name={'clear'} w={'14px'} />}
            variant={'base'}
            borderRadius={'md'}
            aria-label={'delete'}
            onClick={(e) => {
              e.stopPropagation();
              resetChatBox();
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <ChatBox
          ref={ChatBoxRef}
          appAvatar={appDetail.avatar}
          userAvatar={userInfo?.avatar}
          showMarkIcon
          userGuideModule={getGuideModule(modules)}
          showFileSelector={checkChatSupportSelectFileByModules(modules)}
          onStartChat={startChat}
          onDelMessage={() => {}}
        />
      </Box>
      {appDetail.type !== AppTypeEnum.simple && (
        <Flex
          position={'absolute'}
          top={0}
          right={0}
          left={0}
          bottom={0}
          bg={'rgba(255,255,255,0.6)'}
          alignItems={'center'}
          justifyContent={'center'}
          flexDirection={'column'}
          fontSize={'lg'}
          color={'black'}
          whiteSpace={'pre-wrap'}
          textAlign={'center'}
        >
          <Box>{t('app.Advance App TestTip')}</Box>
        </Flex>
      )}
    </Flex>
  );
}

const SimpleEdit = ({ appId }: { appId: string }) => {
  const { isPc } = useSystemStore();
  return (
    <Grid gridTemplateColumns={['1fr', '550px 1fr']} h={'100%'}>
      <Settings appId={appId} />
      {isPc && <ChatTest appId={appId} />}
    </Grid>
  );
};

export default SimpleEdit;
