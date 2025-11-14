'use client';
import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  SimpleGrid,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Center,
  Fade
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { useRouter } from 'next/router';
import { emptyTemplates } from '@/web/core/app/templates';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import HeaderAuthForm from '@/components/common/secret/HeaderAuthForm';
import { getMCPTools, postCreateHttpTools, postCreateMCPTools } from '@/web/core/app/api/tool';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import AppTypeCard from '@/pageComponents/app/create/AppTypeCard';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyBox from '@fastgpt/web/components/common/MyBox';

type FormType = {
  avatar: string;
  name: string;
  // http
  createType?: 'batch' | 'manual';
  // mcp
  mcpUrl?: string;
  mcpHeaderSecret?: any;
  mcpToolList?: any[];
};

export type CreateAppType =
  | AppTypeEnum.simple
  | AppTypeEnum.workflow
  | AppTypeEnum.workflowTool
  | AppTypeEnum.mcpToolSet
  | AppTypeEnum.httpToolSet;

const CreateAppsPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { query } = router;
  const { parentId, appType } = query;

  const [selectedAppType, setSelectedAppType] = useState<CreateAppType>(
    (appType as CreateAppType) || AppTypeEnum.workflow
  );
  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);
  const isToolType = ToolTypeList.includes(selectedAppType);

  const { data: templateData, loading: isLoadingTemplates } = useRequest2(
    () => getTemplateMarketItemList({ isQuickTemplate: true, type: selectedAppType }),
    {
      manual: false,
      refreshDeps: [selectedAppType]
    }
  );

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: createAppTypeMap[selectedAppType]?.icon || '',
      name: '',
      createType: 'batch',
      mcpUrl: '',
      mcpHeaderSecret: {},
      mcpToolList: []
    }
  });
  const avatar = watch('avatar');
  const createType = watch('createType');
  const mcpUrl = watch('mcpUrl');
  const mcpHeaderSecret = watch('mcpHeaderSecret');
  const mcpToolList = watch('mcpToolList');

  const { Component: AvatarUploader, handleFileSelectorOpen: handleAvatarSelectorOpen } =
    useUploadAvatar(getUploadAvatarPresignedUrl, {
      onSuccess(avatar) {
        setValue('avatar', avatar);
      }
    });

  const { runAsync: runGetMCPTools, loading: isGettingMCPTools } = useRequest2(
    (data: { url: string; headerSecret: StoreSecretValueType }) => getMCPTools(data),
    {
      onSuccess: (res: McpToolConfigType[]) => {
        setValue('mcpToolList', res);
      },
      errorToast: t('app:MCP_tools_parse_failed')
    }
  );

  const { runAsync: onClickCreate, loading: isCreating } = useRequest2(
    async (
      { avatar, name, createType, mcpUrl, mcpHeaderSecret, mcpToolList }: FormType,
      templateId?: string
    ): Promise<string> => {
      if (templateId) {
        setCreatingTemplateId(templateId);
      }

      const appType = selectedAppType;
      const baseParams = {
        parentId: parentId as string,
        avatar: avatar,
        name: name?.trim() || t('app:unnamed_app')
      };

      if (appType === AppTypeEnum.mcpToolSet) {
        return postCreateMCPTools({
          ...baseParams,
          url: mcpUrl || '',
          headerSecret: mcpHeaderSecret || {},
          toolList: (mcpToolList || []) as McpToolConfigType[]
        });
      }

      if (appType === AppTypeEnum.httpToolSet) {
        return postCreateHttpTools({
          ...baseParams,
          createType: createType || 'batch'
        });
      }

      if (templateId) {
        const templateDetail = await getTemplateMarketItemDetail(templateId);
        return postCreateApp({
          ...baseParams,
          avatar: templateDetail.avatar,
          name: templateDetail.name,
          type: appType,
          modules: templateDetail.workflow.nodes || [],
          edges: templateDetail.workflow.edges || [],
          chatConfig: templateDetail.workflow.chatConfig || {},
          templateId: templateDetail.templateId
        });
      }
      return postCreateApp({
        ...baseParams,
        type: appType,
        modules: emptyTemplates[appType].nodes,
        edges: emptyTemplates[appType].edges,
        chatConfig: emptyTemplates[appType].chatConfig
      });
    },
    {
      onSuccess(id) {
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  return (
    <Box h={'100vh'} overflow={'hidden'}>
      <Flex px={2} py={3} bg={'myGray.25'}>
        <Button
          variant={'transparentBase'}
          leftIcon={<MyIcon name={'common/backLight'} w={4} color={'myGray.600'} />}
          onClick={() =>
            router.replace(
              ToolTypeList.includes(appType as CreateAppType)
                ? '/dashboard/tool'
                : '/dashboard/agent'
            )
          }
          fontSize={'20px'}
        >
          {t('common:Create') + (isToolType ? t('app:type.Tool') : ' Agent')}
        </Button>
      </Flex>
      <Flex bg={'white'} flex={1} gap={7} p={6} h={'calc(100vh - 60px)'}>
        <Flex
          flex={1}
          p={6}
          flexDirection={'column'}
          rounded={'16px'}
          boxShadow={'0 4px 22.1px 0 rgba(130, 141, 168, 0.20)'}
          h={'full'}
          overflow={'auto'}
          sx={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--chakra-colors-myGray-300) transparent',
            '&::-webkit-scrollbar': {
              width: '6px'
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(0, 0, 0, 0.06)',
              borderRadius: '3px'
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: 'rgba(0, 0, 0, 0.10)'
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'rgba(0, 0, 0, 0.15)'
            }
          }}
        >
          <Box mb={5} borderBottom={'1px solid'} borderColor={'myGray.200'}>
            <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
              {(isToolType ? t('app:type.Tool') : 'Agent ') + t('common:support.standard.type')}
            </Box>
            <SimpleGrid columns={3} gap={2.5} pb={5}>
              {Object.values(createAppTypeMap)
                .filter((option) =>
                  isToolType
                    ? ToolTypeList.includes(option.type as CreateAppType)
                    : !ToolTypeList.includes(option.type as CreateAppType)
                )
                .map((option) => (
                  <AppTypeCard
                    key={option.type}
                    selectedAppType={selectedAppType}
                    onClick={() => {
                      setSelectedAppType(option.type as CreateAppType);
                      setValue(
                        'avatar',
                        createAppTypeMap[option.type as CreateAppType]?.icon || ''
                      );
                    }}
                    option={option}
                  />
                ))}
            </SimpleGrid>
          </Box>
          <Box mb={5}>
            <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5} letterSpacing={'0.15px'}>
              {t('common:app_icon_and_name')}
            </Box>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Flex
                  borderRadius={'6px'}
                  w={10}
                  h={10}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  justifyContent={'center'}
                  alignItems={'center'}
                  mr={2.5}
                >
                  <Avatar
                    src={avatar}
                    borderRadius={'4.667px'}
                    cursor={'pointer'}
                    onClick={handleAvatarSelectorOpen}
                  />
                </Flex>
              </MyTooltip>
              <Input
                flex={1}
                h={8}
                mr={selectedAppType !== AppTypeEnum.mcpToolSet ? 5 : 0}
                placeholder={t('app:unnamed_app')}
                {...register('name')}
              />
              {selectedAppType !== AppTypeEnum.mcpToolSet && (
                <Button
                  isLoading={isCreating}
                  onClick={handleSubmit((data) => onClickCreate(data))}
                >
                  {t('common:Create')}
                </Button>
              )}
            </Flex>
          </Box>
          {templateData?.list && templateData.list.length > 0 && (
            <Box>
              <Flex justifyContent={'space-between'} mb={2.5}>
                <Box color={'myGray.900'} fontWeight={'medium'}>
                  {t('app:create_by_template')}
                </Box>
                <Flex
                  alignItems={'center'}
                  cursor={'pointer'}
                  onClick={() => router.push('/dashboard/templateMarket')}
                >
                  <Box fontSize={'mini'} fontWeight={'medium'}>
                    {t('common:template_market')}
                  </Box>
                  <MyIcon
                    name={'core/chat/chevronRight'}
                    w={'14px'}
                    h={'14px'}
                    color={'myGray.500'}
                  />
                </Flex>
              </Flex>
              <Fade in={!isLoadingTemplates && templateData?.list && templateData.list.length > 0}>
                <SimpleGrid columns={[1, 3]} gridGap={2.5}>
                  {templateData.list.map((item) => (
                    <MyBox
                      key={item.templateId}
                      p={4}
                      borderRadius={'10px'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                      cursor={'pointer'}
                      boxShadow={'none'}
                      bg={'white'}
                      _hover={{
                        boxShadow:
                          '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
                      }}
                      isLoading={creatingTemplateId === item.templateId}
                      onClick={() => {
                        if (!creatingTemplateId) {
                          handleSubmit((data) => onClickCreate(data, item.templateId))();
                        }
                      }}
                    >
                      <Box
                        position={'relative'}
                        h={28}
                        borderRadius={'12px'}
                        overflow={'hidden'}
                        mb={2}
                      >
                        <Avatar
                          src={item.avatar}
                          position={'absolute'}
                          w={'full'}
                          opacity={0.5}
                          top={'50%'}
                          transform={'translate(0, -50%)'}
                          filter={'blur(20px)'}
                          zIndex={0}
                        />
                        <Box
                          position={'absolute'}
                          top={0}
                          left={0}
                          right={0}
                          bottom={0}
                          opacity={0.08}
                          background={
                            'linear-gradient(180deg, rgba(51, 51, 51, 0.00) 50%, #333 131.5%)'
                          }
                          zIndex={1}
                        />

                        <Box
                          position={'absolute'}
                          top={'50%'}
                          left={'50%'}
                          transform={'translate(-50%, -50%)'}
                          zIndex={2}
                        >
                          <Avatar src={item.avatar} w={6} borderRadius={'4px'} />
                        </Box>
                      </Box>

                      <Box color={'myGray.900'}>{t(item.name as any)}</Box>
                      <Box fontSize={'mini'} color={'myGray.500'} flex={1} noOfLines={2} mt={1}>
                        {t(item.intro as any)}
                      </Box>
                    </MyBox>
                  ))}
                </SimpleGrid>
              </Fade>
            </Box>
          )}

          {/* mcp */}
          {selectedAppType === AppTypeEnum.mcpToolSet && (
            <>
              <Box mb={5}>
                <HeaderAuthForm
                  headerSecretValue={mcpHeaderSecret || {}}
                  onChange={(data) => {
                    setValue('mcpHeaderSecret', data);
                  }}
                  bg={'white'}
                />
              </Box>

              <Box mb={5}>
                <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                  {t('app:MCP_tools_url')}
                </Box>
                <Flex alignItems={'center'} gap={2}>
                  <Input
                    flex={1}
                    h={8}
                    placeholder={t('app:MCP_tools_url_placeholder')}
                    {...register('mcpUrl', {
                      required: t('app:MCP_tools_url_is_empty')
                    })}
                  />
                  <Button
                    size={'sm'}
                    variant={'whitePrimary'}
                    h={8}
                    isLoading={isGettingMCPTools}
                    onClick={() => {
                      runGetMCPTools({
                        url: mcpUrl || '',
                        headerSecret: mcpHeaderSecret
                      });
                    }}
                  >
                    {t('common:Parse')}
                  </Button>
                </Flex>
              </Box>

              <Box mb={5}>
                <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                  {t('app:MCP_tools_list')}
                </Box>
                <Box
                  borderRadius={'md'}
                  overflow={'hidden'}
                  borderWidth={'1px'}
                  position={'relative'}
                >
                  <TableContainer maxH={360} minH={200} overflowY={'auto'}>
                    <Table bg={'white'}>
                      <Thead bg={'myGray.50'}>
                        <Tr>
                          <Th fontSize={'mini'} py={0} h={'34px'}>
                            {t('common:Name')}
                          </Th>
                          <Th fontSize={'mini'} py={0} h={'34px'}>
                            {t('common:plugin.Description')}
                          </Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {(mcpToolList || []).map((item: McpToolConfigType) => (
                          <Tr key={item.name} height={'28px'}>
                            <Td
                              fontSize={'mini'}
                              color={'myGray.900'}
                              fontWeight={'medium'}
                              py={2}
                              maxW={'50%'}
                              overflow={'hidden'}
                              textOverflow={'ellipsis'}
                              whiteSpace={'nowrap'}
                            >
                              {item.name}
                            </Td>
                            <Td
                              fontSize={'mini'}
                              color={'myGray.900'}
                              fontWeight={'medium'}
                              py={2}
                              maxW={'50%'}
                              overflow={'hidden'}
                              textOverflow={'ellipsis'}
                              whiteSpace={'nowrap'}
                            >
                              {item.description}
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </TableContainer>
                  {(!mcpToolList || mcpToolList.length === 0) && (
                    <Center
                      position={'absolute'}
                      top={0}
                      left={0}
                      right={0}
                      bottom={0}
                      fontSize={'mini'}
                      color={'myGray.500'}
                      bg={'white'}
                    >
                      {t('app:no_mcp_tools_list')}
                    </Center>
                  )}
                </Box>
              </Box>
              <Flex justifyContent={'end'}>
                <Button
                  isLoading={isCreating}
                  isDisabled={!mcpToolList || mcpToolList.length === 0}
                  onClick={handleSubmit((data) => onClickCreate(data))}
                  w={20}
                >
                  {t('common:Create')}
                </Button>
              </Flex>
            </>
          )}
          {/* http */}
          {selectedAppType === AppTypeEnum.httpToolSet && (
            <>
              <Box mb={5}>
                <Flex alignItems={'center'} mb={2.5}>
                  <Box color={'myGray.900'} fontWeight={'medium'}>
                    {t('app:HTTPTools_Create_Type')}
                  </Box>
                  <Flex ml={'auto'} alignItems={'center'} gap={1}>
                    <MyIcon name={'common/info'} w={'14px'} h={'14px'} color={'myGray.500'} />
                    <Box fontSize={'xs'} color={'myGray.500'}>
                      {t('app:HTTPTools_Create_Type_Tip')}
                    </Box>
                  </Flex>
                </Flex>
                <LeftRadio
                  list={[
                    {
                      title: t('app:type.Http batch'),
                      value: 'batch',
                      desc: t('app:type.Http batch tip')
                    },
                    {
                      title: t('app:type.Http manual'),
                      value: 'manual',
                      desc: t('app:type.Http manual tip')
                    }
                  ]}
                  value={createType || 'batch'}
                  fontSize={'xs'}
                  onChange={(e) => setValue('createType', e as 'batch' | 'manual')}
                  defaultBg={'white'}
                  activeBg={'white'}
                  py={2}
                  px={3}
                  gridGap={2.5}
                />
              </Box>
            </>
          )}
        </Flex>
        {isPc && (
          <Box flex={1} position={'relative'}>
            <Box
              position={'absolute'}
              zIndex={10}
              top={'60px'}
              left={'50%'}
              transform={'translateX(-50%)'}
              w={'full'}
            >
              <Flex alignItems={'center'} justifyContent={'center'}>
                <Box color={'myGray.900'} fontSize={'32px'} fontWeight={'medium'}>
                  {t(createAppTypeMap[selectedAppType].title)}
                </Box>
              </Flex>
              <Flex
                color={'myGray.500'}
                fontSize={'md'}
                letterSpacing={'0.5px'}
                px={16}
                mt={2.5}
                textAlign={'center'}
                justifyContent={'center'}
              >
                {t(createAppTypeMap[selectedAppType].description)}
              </Flex>
            </Box>
            <MyImage
              src={createAppTypeMap[selectedAppType].imgUrl}
              w={'full'}
              position={'absolute'}
              top={0}
              left={0}
              right={0}
              bottom={0}
              style={{ pointerEvents: 'none' }}
            />
          </Box>
        )}
      </Flex>
      <AvatarUploader />
    </Box>
  );
};

export default CreateAppsPage;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}
