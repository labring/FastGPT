'use client';
import React, { useState } from 'react';
import { Box, Flex, Button, Input, Card, Text, SimpleGrid } from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { emptyTemplates, parsePluginFromCurlString } from '@/web/core/app/templates';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { appTypeMap } from '@/pageComponents/app/constants';
import { serviceSideProps } from '@/web/common/i18n/utils';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';

type FormType = {
  avatar: string;
  name: string;
  curlContent: string;
};

export type CreateAppType = AppTypeEnum.agent | AppTypeEnum.workflow | AppTypeEnum.plugin;

const CreateAppsPage = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const { parentId } = router.query;

  const [selectedAppType, setSelectedAppType] = useState<CreateAppType>(AppTypeEnum.agent);

  const { data: templateList = [] } = useRequest2(
    () => getTemplateMarketItemList({ isQuickTemplate: true, type: selectedAppType }),
    {
      manual: false,
      refreshDeps: [selectedAppType]
    }
  );

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: appTypeMap[selectedAppType]?.avatar || '',
      name: '',
      curlContent: ''
    }
  });
  const avatar = watch('avatar');

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const { runAsync: onclickCreate, loading: isCreating } = useRequest2(
    async ({ avatar, name, curlContent }: FormType, templateId?: string) => {
      const appType = selectedAppType;

      // From empty template
      if (!templateId) {
        return postCreateApp({
          parentId: parentId as string,
          avatar: avatar,
          name: name,
          type: appType,
          modules: emptyTemplates[appType].nodes,
          edges: emptyTemplates[appType].edges,
          chatConfig: emptyTemplates[appType].chatConfig
        });
      }

      const { workflow, appAvatar } = await (async () => {
        if (templateId) {
          const templateDetail = await getTemplateMarketItemDetail(templateId);
          return {
            appAvatar: templateDetail.avatar,
            workflow: templateDetail.workflow
          };
        }
        if (curlContent) {
          return {
            appAvatar: avatar,
            workflow: parsePluginFromCurlString(curlContent)
          };
        }
        return Promise.reject('No template or curl content');
      })();

      return postCreateApp({
        parentId: parentId as string,
        avatar: appAvatar,
        name: name,
        type: appType,
        modules: workflow.nodes || [],
        edges: workflow.edges || [],
        chatConfig: workflow.chatConfig || {}
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const appTypeOptionsMap: Record<
    CreateAppType,
    {
      type: CreateAppType;
      icon: string;
      title: string;
      intro: string;
      description: string;
      imgUrl: string;
    }
  > = {
    [AppTypeEnum.agent]: {
      type: AppTypeEnum.agent,
      icon: 'core/app/aiAgent',
      title: 'AI Agent',
      intro: '让AI助手自主调用工具',
      description:
        '由AI驱动的Agent系统，可自行做决策、制定步骤、调用工具，并全程支持交互，适合流程不固定的任务。',
      imgUrl: '/imgs/app/agentPreview.svg'
    },
    [AppTypeEnum.workflow]: {
      type: AppTypeEnum.workflow,
      icon: 'core/app/type/workflowFill',
      title: t('app:type.Workflow bot'),
      intro: '拖拽编排与多轮对话',
      description: '支持记忆的复杂多轮对话工作流。',
      imgUrl: '/imgs/app/workflowPreview.svg'
    },
    [AppTypeEnum.plugin]: {
      type: AppTypeEnum.plugin,
      icon: 'core/app/type/pluginFill',
      title: t('app:type.Plugin'),
      intro: '常用于封装工作流',
      description: '一键输出指定结果。',
      imgUrl: '/imgs/app/pluginPreview.svg'
    }
  };

  return (
    <Box h={'100vh'} overflow={'hidden'}>
      <Flex px={4} py={3} bg={'myGray.25'}>
        <Button
          variant={'ghost'}
          leftIcon={<MyIcon name={'common/backLight'} w={4} />}
          bg={'none'}
          color={'myGray.900'}
          px={1}
          py={1.5}
          onClick={() => router.back()}
          fontSize={'20px'}
        >
          {t('common:create_app')}
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
        >
          <Box pb={5} mb={5} borderBottom={'1px solid'} borderColor={'myGray.200'}>
            <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
              {t('common:app_type')}
            </Box>
            <SimpleGrid columns={3} gap={2.5}>
              {Object.values(appTypeOptionsMap).map((option) => (
                <Card
                  key={option.type}
                  p={4}
                  borderRadius={'10px'}
                  border={'1px solid'}
                  borderColor={selectedAppType === option.type ? 'primary.300' : 'myGray.200'}
                  boxShadow={
                    selectedAppType === option.type
                      ? '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
                      : 'none'
                  }
                  cursor={'pointer'}
                  onClick={() => {
                    setSelectedAppType(option.type);
                    setValue(
                      'avatar',
                      appTypeMap[option.type as keyof typeof appTypeMap]?.avatar || ''
                    );
                  }}
                  _hover={{
                    boxShadow:
                      '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
                  }}
                >
                  <MyIcon name={option.icon as any} w={'6'} />
                  <Box fontWeight={'medium'} color={'myGray.900'} mt={2}>
                    {option.title}
                  </Box>
                  <Text fontSize={'mini'} color={'myGray.500'} mt={0.5} lineHeight={'16px'}>
                    {option.intro}
                  </Text>
                </Card>
              ))}
            </SimpleGrid>
          </Box>

          <Box mb={5}>
            <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5} letterSpacing={'0.15px'}>
              {t('common:app_icon_and_name')}
            </Box>
            <Flex alignItems={'center'}>
              <MyTooltip label={t('common:set_avatar')}>
                <Box
                  p={1}
                  mr={2.5}
                  borderRadius={'6px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                >
                  <Avatar
                    src={avatar}
                    w={7}
                    borderRadius={'4.667px'}
                    cursor={'pointer'}
                    onClick={onOpenSelectFile}
                  />
                </Box>
              </MyTooltip>
              <Input
                flex={1}
                h={8}
                mr={5}
                placeholder={'请输入应用名称'}
                {...register('name', {
                  required: t('common:core.app.error.App name can not be empty')
                })}
              />
              <Button isLoading={isCreating} onClick={handleSubmit((data) => onclickCreate(data))}>
                {t('common:Create')}
              </Button>
            </Flex>
          </Box>

          {templateList.length > 0 && (
            <Box>
              <Box color={'myGray.900'} fontWeight={'medium'} mb={2.5}>
                {t('app:create_by_template')}
              </Box>

              <SimpleGrid columns={[1, 3]} gridGap={2.5}>
                {templateList.map((item) => (
                  <Card
                    key={item.templateId}
                    p={4}
                    borderRadius={'10px'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    cursor={'pointer'}
                    boxShadow={'none'}
                    _hover={{
                      boxShadow:
                        '0 4px 10px 0 rgba(19, 51, 107, 0.08), 0 0 1px 0 rgba(19, 51, 107, 0.08)'
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
                    <Box fontSize={'mini'} color={'myGray.500'} mt={2}>
                      by {item.author || feConfigs.systemTitle}
                    </Box>
                  </Card>
                ))}
              </SimpleGrid>
            </Box>
          )}
        </Flex>
        {/* preview image */}
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
                {appTypeOptionsMap[selectedAppType].title}
              </Box>
              {selectedAppType === AppTypeEnum.agent && (
                <MyIcon name={'core/app/agent'} w={'24px'} h={'24px'} ml={2.5} />
              )}
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
              {appTypeOptionsMap[selectedAppType].description}
            </Flex>
          </Box>
          <MyImage
            src={appTypeOptionsMap[selectedAppType].imgUrl}
            w={'full'}
            position={'absolute'}
            top={0}
            left={0}
            right={0}
            bottom={0}
          />
        </Box>
      </Flex>
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
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
