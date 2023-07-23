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
import { formatPrice } from '@/utils/user';
import {
  ChatModelSystemTip,
  ChatModelLimitTip,
  welcomeTextTip
} from '@/constants/flow/ModuleTemplate';
import { AppModuleItemType, VariableItemType } from '@/types/app';
import { useRequest } from '@/hooks/useRequest';
import { useConfirm } from '@/hooks/useConfirm';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { streamFetch } from '@/api/fetch';

import dynamic from 'next/dynamic';
import MySelect from '@/components/Select';
import MySlider from '@/components/Slider';
import MyTooltip from '@/components/MyTooltip';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import ChatBox, {
  getSpecialModule,
  type ComponentRef,
  type StartChatFnProps
} from '@/components/ChatBox';
import { addVariable } from '../VariableEditModal';
import { KBSelectModal, KbParamsModal } from '../KBSelectModal';

const VariableEditModal = dynamic(() => import('../VariableEditModal'));

const Settings = ({ appId }: { appId: string }) => {
  const theme = useTheme();
  const { appDetail, updateAppDetail, loadKbList, myKbList } = useUserStore();
  const { isPc } = useGlobalStore();

  const [editVariable, setEditVariable] = useState<VariableItemType>();

  useQuery(['initkb', appId], () => loadKbList());

  const [refresh, setRefresh] = useState(false);

  const { openConfirm, ConfirmChild } = useConfirm({
    title: '警告',
    content: '保存后将会覆盖高级编排配置，请确保该应用未使用高级编排功能。'
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
    () => myKbList.filter((item) => kbList.find((kb) => kb.kbId === item._id)),
    [myKbList, kbList]
  );

  const appModule2Form = useCallback(() => {
    const formVal = appModules2Form(appDetail.modules);
    reset(formVal);
    setRefresh((state) => !state);
  }, [appDetail.modules, reset]);

  const { mutate: onSubmitSave, isLoading: isSaving } = useRequest({
    mutationFn: async (data: EditFormType) => {
      const modules = appForm2Modules(data);

      await updateAppDetail(appDetail._id, {
        modules
      });
    },
    successToast: '保存成功',
    errorToast: '保存出现异常'
  });

  useEffect(() => {
    appModule2Form();
  }, [appModule2Form]);

  const BoxStyles: BoxProps = {
    bg: 'myWhite.300',
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
      display={['block', 'flex']}
      flexDirection={'column'}
      h={'100%'}
      borderRight={'1.5px solid'}
      borderColor={'myGray.200'}
      pt={4}
      pl={4}
    >
      <Flex pr={4} justifyContent={'space-between'}>
        <Box fontSize={['md', 'xl']} fontWeight={'bold'}>
          应用配置
          <MyTooltip label={'仅包含基础功能，复杂 agent 功能请使用高级编排。'}>
            <QuestionOutlineIcon ml={2} fontSize={'md'} />
          </MyTooltip>
        </Box>
        <Button
          isLoading={isSaving}
          fontSize={'sm'}
          onClick={openConfirm(handleSubmit((data) => onSubmitSave(data)))}
        >
          {isPc ? '保存并预览' : '保存'}
        </Button>
      </Flex>
      <Box flex={'1 0 0'} my={4} pr={4} overflowY={'auto'}>
        {/* variable */}
        <Box {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Avatar src={'/imgs/module/variable.png'} objectFit={'contain'} w={'18px'} />
            <Box ml={2} flex={1}>
              变量
            </Box>
            <Flex {...BoxBtnStyles} onClick={() => setEditVariable(addVariable())}>
              +&ensp;新增
            </Flex>
          </Flex>
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
        </Box>

        <Box mt={5} {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Avatar src={'/imgs/module/AI.png'} w={'18px'} />
            <Box ml={2}>AI 配置</Box>
          </Flex>

          <Flex alignItems={'center'} mt={5}>
            <Box {...LabelStyles}>对话模型</Box>
            <MySelect
              width={['100%', '300px']}
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
              <MyTooltip label={ChatModelSystemTip}>
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
          <Flex mt={5} alignItems={'flex-start'}>
            <Box {...LabelStyles}>
              限定词
              <MyTooltip label={ChatModelLimitTip}>
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
            </Box>
            <Textarea
              rows={5}
              placeholder={ChatModelLimitTip}
              borderColor={'myGray.100'}
              {...register('chatModel.limitPrompt')}
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
          </Flex>
          <Flex mt={1} color={'myGray.600'} fontSize={['sm', 'md']}>
            相似度: {getValues('kb.searchSimilarity')}, 单次搜索数量: {getValues('kb.searchLimit')},
            空搜索时拒绝回复: {getValues('kb.searchEmptyText') !== '' ? 'true' : 'false'}
          </Flex>
          <Grid templateColumns={['1fr', 'repeat(2,1fr)']} my={2} gridGap={[2, 4]}>
            {selectedKbList.map((item) => (
              <Flex
                key={item._id}
                alignItems={'center'}
                p={2}
                bg={'white'}
                boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                borderRadius={'md'}
                border={theme.borders.base}
              >
                <Avatar src={item.avatar} w={'18px'} mr={1} />
                <Box flex={'1 0 0'} w={0} className={'textEllipsis'} fontSize={'sm'}>
                  {item.name}
                </Box>
              </Flex>
            ))}
          </Grid>
        </Box>

        {/* welcome */}
        <Box mt={5} {...BoxStyles}>
          <Flex alignItems={'center'}>
            <Avatar src={'/imgs/module/userGuide.png'} w={'18px'} />
            <Box mx={2}>对话开场白</Box>
            <MyTooltip label={welcomeTextTip}>
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
      </Box>

      <ConfirmChild />
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
              appendVariable(variable);
            }

            setEditVariable(undefined);
          }}
        />
      )}
      {isOpenKbSelect && (
        <KBSelectModal
          kbList={myKbList}
          activeKbs={selectedKbList.map((item) => ({ kbId: item._id }))}
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
  const { appDetail } = useUserStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const [modules, setModules] = useState<AppModuleItemType[]>([]);

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const historyMaxLen =
        modules
          ?.find((item) => item.flowType === FlowModuleTypeEnum.historyNode)
          ?.inputs?.find((item) => item.key === 'maxContext')?.value || 0;
      const history = messages.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText } = await streamFetch({
        url: '/api/chat/chatTest',
        data: {
          history,
          prompt: messages[messages.length - 2].content,
          modules,
          variables,
          appId,
          appName: `调试-${appDetail.name}`
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      return { responseText };
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
    <Flex flexDirection={'column'} h={'100%'} py={4} overflowX={'auto'}>
      <Flex px={[2, 5]}>
        <Box fontSize={['md', 'xl']} fontWeight={'bold'} flex={1}>
          调试预览
        </Box>
        <MyTooltip label={'重置'}>
          <IconButton
            className="chat"
            size={'sm'}
            icon={<MyIcon name={'clearLight'} w={'14px'} />}
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
          {...getSpecialModule(modules)}
          onStartChat={startChat}
          onDelMessage={() => {}}
        />
      </Box>
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
