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
  IconButton,
  Text,
  Switch
} from '@chakra-ui/react';
import { useUserStore } from '@/store/user';
import { useQuery } from '@tanstack/react-query';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { useForm, useFieldArray } from 'react-hook-form';
import { useGlobalStore } from '@/store/global';
import {
  appModules2Form,
  getDefaultAppForm,
  appForm2Modules,
  type EditFormType
} from '@/utils/app';
import { chatModelList } from '@/store/static';
import { formatPrice } from '@fastgpt/common/bill/index';
import {
  ChatModelSystemTip,
  ChatModelLimitTip,
  welcomeTextTip,
  questionGuideTip
} from '@/constants/flow/ModuleTemplate';
import { AppModuleItemType, VariableItemType } from '@/types/app';
import { useRequest } from '@/hooks/useRequest';
import { useConfirm } from '@/hooks/useConfirm';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { streamFetch } from '@/api/fetch';
import { useRouter } from 'next/router';
import { useToast } from '@/hooks/useToast';
import { AppSchema } from '@/types/mongoSchema';
import { delModelById } from '@/api/app';
import { useTranslation } from 'react-i18next';
import { getGuideModule } from '@/components/ChatBox/utils';

import dynamic from 'next/dynamic';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';

import { addVariable } from '../VariableEditModal';
import { KbParamsModal } from '../DatasetSelectModal';
import { AppTypeEnum } from '@/constants/app';
import { useDatasetStore } from '@/store/dataset';

const VariableEditModal = dynamic(() => import('../VariableEditModal'));
const InfoModal = dynamic(() => import('../InfoModal'));
const DatasetSelectModal = dynamic(() => import('../DatasetSelectModal'));
const AIChatSettingsModal = dynamic(() => import('../AIChatSettingsModal'));

const Settings = ({ appId }: { appId: string }) => {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { appDetail, updateAppDetail } = useUserStore();
  const { loadAllDatasets, allDatasets } = useDatasetStore();
  const { isPc } = useGlobalStore();

  const [editVariable, setEditVariable] = useState<VariableItemType>();
  const [settingAppInfo, setSettingAppInfo] = useState<AppSchema>();

  const [refresh, setRefresh] = useState(false);

  const { openConfirm: openConfirmSave, ConfirmModal: ConfirmSaveModal } = useConfirm({
    content: t('app.Confirm Save App Tip')
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
  const { fields: kbList, replace: replaceKbList } = useFieldArray({
    control,
    name: 'kb.list'
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
  const tokenLimit = useMemo(() => {
    return (
      chatModelList.find((item) => item.model === getValues('chatModel.model'))?.contextMaxToken ||
      4000
    );
  }, [getValues, refresh]);
  const selectedKbList = useMemo(
    () => allDatasets.filter((item) => kbList.find((kb) => kb.kbId === item._id)),
    [allDatasets, kbList]
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
        title: '删除成功',
        status: 'success'
      });
      router.replace(`/app/list`);
    },
    errorToast: '删除失败'
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
        type: AppTypeEnum.basic
      });
    },
    successToast: '保存成功',
    errorToast: '保存出现异常'
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
      overflow={'overlay'}
    >
      <Flex alignItems={'flex-end'}>
        <Box fontSize={['md', 'xl']} fontWeight={'bold'}>
          基础信息
        </Box>
        <Box ml={1} color={'myGray.500'} fontSize={'sm'}>
          (
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
          <Button
            size={['sm', 'md']}
            variant={'base'}
            leftIcon={<MyIcon name={'settingLight'} w={'16px'} />}
            onClick={() => setSettingAppInfo(appDetail)}
          >
            设置
          </Button>
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

      {/* model */}
      <Box mt={5} {...BoxStyles}>
        <Flex alignItems={'center'}>
          <Avatar src={'/imgs/module/AI.png'} w={'18px'} />
          <Box ml={2} flex={1}>
            AI 配置
          </Box>
        </Flex>

        <Flex alignItems={'center'} mt={5}>
          <Box {...LabelStyles}>对话模型</Box>
          <Box flex={'1 0 0'}>
            <MySelect
              width={'100%'}
              value={getValues('chatModel.model')}
              list={chatModelSelectList}
              onchange={(val: any) => {
                setValue('chatModel.model', val);
                const maxToken =
                  chatModelList.find((item) => item.model === getValues('chatModel.model'))
                    ?.contextMaxToken || 4000;
                const token = maxToken / 2;
                setValue('chatModel.maxToken', token);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} my={10}>
          <Box {...LabelStyles}>温度</Box>
          <Box flex={1} ml={'10px'}>
            <MySlider
              markList={[
                { label: '严谨', value: 0 },
                { label: '发散', value: 10 }
              ]}
              width={'95%'}
              min={0}
              max={10}
              value={getValues('chatModel.temperature')}
              onChange={(e) => {
                setValue('chatModel.temperature', e);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex alignItems={'center'} mt={12} mb={10}>
          <Box {...LabelStyles}>回复上限</Box>
          <Box flex={1} ml={'10px'}>
            <MySlider
              markList={[
                { label: '100', value: 100 },
                { label: `${tokenLimit}`, value: tokenLimit }
              ]}
              width={'95%'}
              min={100}
              max={tokenLimit}
              step={50}
              value={getValues('chatModel.maxToken')}
              onChange={(val) => {
                setValue('chatModel.maxToken', val);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        <Flex mt={10} alignItems={'flex-start'}>
          <Box {...LabelStyles}>
            提示词
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

      {/* kb */}
      <Box mt={5} {...BoxStyles}>
        <Flex alignItems={'center'}>
          <Flex alignItems={'center'} flex={1}>
            <Avatar src={'/imgs/module/db.png'} w={'18px'} />
            <Box ml={2}>知识库</Box>
          </Flex>
          <Flex alignItems={'center'} mr={3} {...BoxBtnStyles} onClick={onOpenKbSelect}>
            <SmallAddIcon />
            选择
          </Flex>
          <Flex alignItems={'center'} {...BoxBtnStyles} onClick={onOpenKbParams}>
            <MyIcon name={'edit'} w={'14px'} mr={1} />
            参数
          </Flex>
          <Flex {...BoxBtnStyles} onClick={onOpenAIChatSetting}>
            <MyIcon mr={1} name={'settingLight'} w={'14px'} />
            提示词
          </Flex>
        </Flex>
        <Flex mt={1} color={'myGray.600'} fontSize={['sm', 'md']}>
          相似度: {getValues('kb.searchSimilarity')}, 单次搜索数量: {getValues('kb.searchLimit')},
          空搜索时拒绝回复: {getValues('kb.searchEmptyText') !== '' ? 'true' : 'false'}
        </Flex>
        <Grid templateColumns={['repeat(2,1fr)', 'repeat(3,1fr)']} my={2} gridGap={[2, 4]}>
          {selectedKbList.map((item) => (
            <MyTooltip key={item._id} label={'查看知识库详情'}>
              <Flex
                alignItems={'center'}
                p={2}
                bg={'white'}
                boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                borderRadius={'md'}
                border={theme.borders.base}
                cursor={'pointer'}
                onClick={() =>
                  router.push({
                    pathname: '/kb/detail',
                    query: {
                      kbId: item._id
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
        <Flex alignItems={'center'}>
          <MyIcon name={'questionGuide'} mr={2} w={'16px'} />
          <Box>下一步指引</Box>
          <MyTooltip label={questionGuideTip} forceShow>
            <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
          </MyTooltip>
          <Box flex={1} />
          <Switch
            isChecked={getValues('questionGuide')}
            size={'lg'}
            onChange={(e) => {
              const value = e.target.checked;
              setValue('questionGuide', value);
              setRefresh((state) => !state);
            }}
          />
        </Flex>
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
          activeKbs={selectedKbList.map((item) => ({
            kbId: item._id,
            vectorModel: item.vectorModel
          }))}
          onClose={onCloseKbSelect}
          onChange={replaceKbList}
        />
      )}

      {isOpenKbParams && (
        <KbParamsModal
          searchEmptyText={getValues('kb.searchEmptyText')}
          searchLimit={getValues('kb.searchLimit')}
          searchSimilarity={getValues('kb.searchSimilarity')}
          onClose={onCloseKbParams}
          onChange={({ searchEmptyText, searchLimit, searchSimilarity }) => {
            setValue('kb.searchEmptyText', searchEmptyText);
            setValue('kb.searchLimit', searchLimit);
            setValue('kb.searchSimilarity', searchSimilarity);
            setRefresh((state) => !state);
          }}
        />
      )}
    </Box>
  );
};

const ChatTest = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { appDetail, userInfo } = useUserStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const [modules, setModules] = useState<AppModuleItemType[]>([]);

  const startChat = useCallback(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      const historyMaxLen =
        modules
          ?.find((item) => item.flowType === FlowModuleTypeEnum.historyNode)
          ?.inputs?.find((item) => item.key === 'maxContext')?.value || 0;
      const history = chatList.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/chat/chatTest',
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
          调试预览
        </Box>
        <MyTooltip label={'重置'}>
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
  const { isPc } = useGlobalStore();
  return (
    <Grid gridTemplateColumns={['1fr', '550px 1fr']} h={'100%'}>
      <Settings appId={appId} />
      {isPc && <ChatTest appId={appId} />}
    </Grid>
  );
};

export default BasicEdit;
