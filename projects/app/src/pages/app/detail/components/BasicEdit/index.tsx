import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  BoxProps,
  Textarea,
  useTheme,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useDisclosure,
  Button,
  IconButton
} from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useQuery } from '@tanstack/react-query';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { useForm, useFieldArray } from 'react-hook-form';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  appModules2Form,
  getDefaultAppForm,
  appForm2Modules,
  type EditFormType
} from '@/web/core/app/basicSettings';
import { chatModelList } from '@/web/common/system/staticData';
import { formatPrice } from '@fastgpt/global/support/wallet/bill/tools';
import { ChatModelSystemTip, welcomeTextTip } from '@/constants/flow/ModuleTemplate';
import { VariableItemType } from '@/types/app';
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
import { getGuideModule } from '@/global/core/app/modules/utils';

import dynamic from 'next/dynamic';
import MySelect from '@/components/Select';
import MyTooltip from '@/components/MyTooltip';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';

import { addVariable } from '@/components/core/module/VariableEditModal';
import { DatasetParamsModal } from '@/components/core/module/DatasetSelectModal';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import PermissionIconText from '@/components/support/permission/IconText';
import QGSwitch from '../QGSwitch';
import TTSSelect from '../TTSSelect';

const VariableEditModal = dynamic(() => import('@/components/core/module/VariableEditModal'));
const InfoModal = dynamic(() => import('../InfoModal'));
const DatasetSelectModal = dynamic(() => import('@/components/core/module/DatasetSelectModal'));
const AIChatSettingsModal = dynamic(() => import('@/components/core/module/AIChatSettingsModal'));

const Settings = ({ appId }: { appId: string }) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { appDetail, updateAppDetail } = useAppStore();
  const { loadAllDatasets, allDatasets } = useDatasetStore();
  const { isPc } = useSystemStore();

  const [editVariable, setEditVariable] = useState<VariableItemType>();
  const [settingAppInfo, setSettingAppInfo] = useState<AppSchema>();

  const [refresh, setRefresh] = useState(false);

  const { openConfirm: openConfirmSave, ConfirmModal: ConfirmSaveModal } = useConfirm({
    content: t('app.Confirm Save App Tip'),
    bg: appDetail.type === AppTypeEnum.basic ? '' : 'red.600'
  });
  const { openConfirm: openConfirmDel, ConfirmModal: ConfirmDelModal } = useConfirm({
    content: t('app.Confirm Del App Tip')
  });
  const { register, setValue, getValues, reset, handleSubmit, control } = useForm<EditFormType>({
    defaultValues: getDefaultAppForm()
  });

  const {
    fields: variables,
    append: appendVariable,
    remove: removeVariable,
    replace: replaceVariables
  } = useFieldArray({
    control,
    name: 'variables'
  });
  const { fields: datasets, replace: replaceKbList } = useFieldArray({
    control,
    name: 'dataset.list'
  });

  const {
    isOpen: isOpenAIChatSetting,
    onOpen: onOpenAIChatSetting,
    onClose: onCloseAIChatSetting
  } = useDisclosure();
  const {
    isOpen: isOpenKbSelect,
    onOpen: onOpenKbSelect,
    onClose: onCloseKbSelect
  } = useDisclosure();
  const {
    isOpen: isOpenKbParams,
    onOpen: onOpenKbParams,
    onClose: onCloseKbParams
  } = useDisclosure();

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

  const appModule2Form = useCallback(() => {
    const formVal = appModules2Form(appDetail.modules);
    reset(formVal);
    setTimeout(() => {
      setRefresh((state) => !state);
    }, 100);
  }, [appDetail.modules, reset]);

  const { mutate: onSubmitSave, isLoading: isSaving } = useRequest({
    mutationFn: async (data: EditFormType) => {
      const modules = appForm2Modules(data);

      await updateAppDetail(appDetail._id, {
        modules,
        type: AppTypeEnum.basic,
        permission: undefined
      });
    },
    successToast: t('common.Save Success'),
    errorToast: t('common.Save Failed')
  });

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
    <Box
      h={'100%'}
      borderRight={'1.5px solid'}
      borderColor={'myGray.200'}
      p={4}
      pt={[0, 4]}
      pb={10}
      overflow={'overlay'}
    >
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

      <Flex mt={5} justifyContent={'space-between'} alignItems={'center'}>
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
          variant={appDetail.type === AppTypeEnum.basic ? 'primary' : 'base'}
          onClick={() => {
            if (appDetail.type !== AppTypeEnum.basic) {
              openConfirmSave(handleSubmit((data) => onSubmitSave(data)))();
            } else {
              handleSubmit((data) => onSubmitSave(data))();
            }
          }}
        >
          {isPc ? '保存并预览' : '保存'}
        </Button>
      </Flex>

      {/* welcome */}
      <Box mt={5} {...BoxStyles}>
        <Flex alignItems={'center'}>
          <Avatar src={'/imgs/module/userGuide.png'} w={'18px'} />
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
          {...register('guide.welcome.text')}
        />
      </Box>
      {/* variable */}
      <Box mt={2} {...BoxStyles}>
        <Flex alignItems={'center'}>
          <Avatar src={'/imgs/module/variable.png'} objectFit={'contain'} w={'18px'} />
          <Box ml={2} flex={1}>
            变量
          </Box>
          <Flex {...BoxBtnStyles} onClick={() => setEditVariable(addVariable())}>
            +&ensp;新增
          </Flex>
        </Flex>
        {variables.length > 0 && (
          <Box
            mt={2}
            borderRadius={'lg'}
            overflow={'hidden'}
            borderWidth={'1px'}
            borderBottom="none"
          >
            <TableContainer>
              <Table bg={'white'}>
                <Thead>
                  <Tr>
                    <Th>变量名</Th>
                    <Th>变量 key</Th>
                    <Th>必填</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {variables.map((item, index) => (
                    <Tr key={item.id}>
                      <Td>{item.label} </Td>
                      <Td>{item.key}</Td>
                      <Td>{item.required ? '✔' : ''}</Td>
                      <Td>
                        <MyIcon
                          mr={3}
                          name={'settingLight'}
                          w={'16px'}
                          cursor={'pointer'}
                          onClick={() => setEditVariable(item)}
                        />
                        <MyIcon
                          name={'delete'}
                          w={'16px'}
                          cursor={'pointer'}
                          onClick={() => removeVariable(index)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>

      {/* ai */}
      <Box mt={5} {...BoxStyles}>
        <Flex alignItems={'center'}>
          <Avatar src={'/imgs/module/AI.png'} w={'18px'} />
          <Box ml={2} flex={1}>
            {t('app.AI Settings')}
          </Box>
          <Flex {...BoxBtnStyles} onClick={onOpenAIChatSetting}>
            <MyIcon mr={1} name={'settingLight'} w={'14px'} />
            {t('app.Open AI Advanced Settings')}
          </Flex>
        </Flex>

        <Flex alignItems={'center'} mt={5}>
          <Box {...LabelStyles}>{t('core.ai.Model')}</Box>
          <Box flex={'1 0 0'}>
            <MySelect
              width={'100%'}
              value={getValues('chatModel.model')}
              list={chatModelSelectList}
              onchange={(val: any) => {
                setValue('chatModel.model', val);
                const maxToken =
                  chatModelList.find((item) => item.model === getValues('chatModel.model'))
                    ?.maxResponse || 4000;
                const token = maxToken / 2;
                setValue('chatModel.maxToken', token);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex mt={10} alignItems={'flex-start'}>
          <Box {...LabelStyles}>
            {t('core.ai.Prompt')}
            <MyTooltip label={ChatModelSystemTip} forceShow>
              <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
            </MyTooltip>
          </Box>
          <Textarea
            rows={5}
            placeholder={ChatModelSystemTip}
            borderColor={'myGray.100'}
            {...register('chatModel.systemPrompt')}
          ></Textarea>
        </Flex>
      </Box>

      {/* dataset */}
      <Box mt={5} {...BoxStyles}>
        <Flex alignItems={'center'}>
          <Flex alignItems={'center'} flex={1}>
            <Avatar src={'/imgs/module/db.png'} w={'18px'} />
            <Box ml={2}>{t('core.dataset.Choose Dataset')}</Box>
          </Flex>
          <Flex alignItems={'center'} mr={3} {...BoxBtnStyles} onClick={onOpenKbSelect}>
            <SmallAddIcon />
            {t('common.Choose')}
          </Flex>
          <Flex alignItems={'center'} {...BoxBtnStyles} onClick={onOpenKbParams}>
            <MyIcon name={'edit'} w={'14px'} mr={1} />
            {t('common.Params')}
          </Flex>
        </Flex>
        <Flex mt={1} color={'myGray.600'} fontSize={['sm', 'md']}>
          {t('core.dataset.Similarity')}: {getValues('dataset.searchSimilarity')},{' '}
          {t('core.dataset.Search Top K')}: {getValues('dataset.searchLimit')}
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

      <Box mt={5} {...BoxStyles}>
        <TTSSelect
          value={getValues('tts')}
          onChange={(e) => {
            setValue('tts', e);
            setRefresh((state) => !state);
          }}
        />
      </Box>

      <Box mt={5} {...BoxStyles}>
        <QGSwitch
          isChecked={getValues('questionGuide')}
          size={'lg'}
          onChange={(e) => {
            const value = e.target.checked;
            setValue('questionGuide', value);
            setRefresh((state) => !state);
          }}
        />
      </Box>

      <ConfirmSaveModal />
      <ConfirmDelModal />
      {settingAppInfo && (
        <InfoModal defaultApp={settingAppInfo} onClose={() => setSettingAppInfo(undefined)} />
      )}
      {editVariable && (
        <VariableEditModal
          defaultVariable={editVariable}
          onClose={() => setEditVariable(undefined)}
          onSubmit={({ variable }) => {
            const record = variables.find((item) => item.id === variable.id);
            if (record) {
              replaceVariables(
                variables.map((item) => (item.id === variable.id ? variable : item))
              );
            } else {
              // auth same key
              if (variables.find((item) => item.key === variable.key)) {
                return toast({
                  status: 'warning',
                  title: t('app.Variable Key Repeat Tip')
                });
              }
              appendVariable(variable);
            }

            setEditVariable(undefined);
          }}
        />
      )}
      {isOpenAIChatSetting && (
        <AIChatSettingsModal
          onClose={onCloseAIChatSetting}
          onSuccess={(e) => {
            setValue('chatModel', e);
            onCloseAIChatSetting();
          }}
          defaultData={getValues('chatModel')}
        />
      )}
      {isOpenKbSelect && (
        <DatasetSelectModal
          isOpen={isOpenKbSelect}
          activeDatasets={selectDatasets.map((item) => ({
            datasetId: item._id,
            vectorModel: item.vectorModel
          }))}
          onClose={onCloseKbSelect}
          onChange={replaceKbList}
        />
      )}

      {isOpenKbParams && (
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
};

const ChatTest = ({ appId }: { appId: string }) => {
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
    const formVal = appModules2Form(appDetail.modules);
    setModules(appForm2Modules(formVal));
    resetChatBox();
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
          onStartChat={startChat}
          onDelMessage={() => {}}
        />
      </Box>
      {appDetail.type !== AppTypeEnum.basic && (
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
};

const BasicEdit = ({ appId }: { appId: string }) => {
  const { isPc } = useSystemStore();
  return (
    <Grid gridTemplateColumns={['1fr', '550px 1fr']} h={'100%'}>
      <Settings appId={appId} />
      {isPc && <ChatTest appId={appId} />}
    </Grid>
  );
};

export default BasicEdit;
