import { Box, Button, Flex, HStack, Input, Switch, Textarea } from '@chakra-ui/react';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSelectFile } from '@fastgpt/web/common/file/hooks/useSelectFile';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { DragEvent } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { delTemplate, postCreateTemplate, putUpdateTemplate } from '@/web/core/app/templates/api';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import type { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import dynamic from 'next/dynamic';
import { getAppType } from '@fastgpt/global/core/app/utils';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import { useUploadAvatar } from '@fastgpt/web/common/file/hooks/useUploadAvatar';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { UserTagsEnum } from '@fastgpt/global/support/user/type';

export const defaultTemplate: AppTemplateSchemaType = {
  templateId: '',
  name: '',
  intro: '',
  avatar: '',
  author: '',
  tags: [AppTemplateTypeEnum.writing],
  type: 'advanced',
  isActive: true,
  isPromoted: false,
  promoteTags: [],
  hideTags: [],
  recommendText: '',
  userGuide: {
    type: 'markdown',
    content: '',
    link: ''
  },
  workflow: {
    nodes: [],
    edges: []
  }
};

export const appTypeMap = {
  [AppTypeEnum.chatAgent]: '对话 Agent V2',
  [AppTypeEnum.simple]: '对话 Agent',
  [AppTypeEnum.workflow]: '工作流 Agent',
  [AppTypeEnum.workflowTool]: '工作流工具',
  [AppTypeEnum.toolFolder]: '文件夹',
  [AppTypeEnum.folder]: '文件夹',
  [AppTypeEnum.mcpToolSet]: 'MCP 工具集',
  [AppTypeEnum.tool]: 'MCP工具',
  [AppTypeEnum.httpToolSet]: 'HTTP 工具集',
  [AppTypeEnum.hidden]: '隐藏',

  [AppTypeEnum.httpPlugin]: 'HTTP 插件'
};

const TemplateConfigModal = ({
  defaultForm = defaultTemplate,
  templateTypes = [],
  onSuccess,
  onClose
}: {
  defaultForm: AppTemplateSchemaType;
  templateTypes: TemplateTypeSchemaType[];
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const [isDragging, setIsDragging] = useState(false);
  const [workflowStr, setWorkflowStr] = useState('');

  const { register, setValue, watch, handleSubmit } = useForm({
    defaultValues: defaultForm
  });

  const avatar = watch('avatar');
  const workflow = watch('workflow');
  const templateId = watch('templateId');
  const userGuideType = watch('userGuide.type') ?? 'markdown';
  const type = watch('type');
  const tags = watch('tags');
  const isPromoted = watch('isPromoted');
  const intro = watch('intro');
  const recommendText = watch('recommendText');
  const promoteTags = watch('promoteTags') || [];
  const hideTags = watch('hideTags') || [];

  // Prepare user tags list for MultipleSelect
  const userTagsList = Object.values(UserTagsEnum).map((tag) => ({
    label: tag,
    value: tag
  }));

  const source = templateId.split('-')[0];
  const isCommunity = source === AppToolSourceEnum.community;
  const isEdit = !!defaultForm.templateId;
  const isPluginSystemTemplate = isEdit && isCommunity;
  const templateType = tags.find((tag) => tag !== AppTemplateTypeEnum.recommendation);
  const templateTypeName = templateTypes.find(
    (templateTypeItem) => templateTypeItem.typeId === templateType
  )?.typeName;

  const afterUploadAvatar = useCallback(
    (avatar: string) => {
      setValue('avatar', avatar);
    },
    [setValue]
  );
  const { Component: AvatarUploader, handleFileSelectorOpen } = useUploadAvatar(
    getUploadAvatarPresignedUrl,
    {
      onSuccess: afterUploadAvatar
    }
  );

  const { File: ConfigFile, onOpen: onOpenSelectConfigFile } = useSelectFile({
    fileType: 'json',
    multiple: false
  });

  const readJSONFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!file.name.endsWith('.json')) {
          toast({
            title: '请选择 JSON 文件',
            status: 'error'
          });
          return;
        }
        if (e.target) {
          setWorkflowStr(e.target.result as string);
        }
      };
      reader.readAsText(file);
    },
    [toast]
  );

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      readJSONFile(file);
      setIsDragging(false);
    },
    [readJSONFile]
  );

  const onSelectConfigFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      readJSONFile(file);
    },
    [readJSONFile]
  );

  const { ConfirmModal: DeleteConfirmModal, openConfirm: openDeleteConfirm } = useConfirm({
    type: 'delete',
    content: '确认删除该模板么？'
  });

  const { runAsync: onDelete } = useRequest(delTemplate, {
    onSuccess() {
      toast({
        title: '删除成功',
        status: 'success'
      });
      onSuccess();
      onClose();
    }
  });

  const { runAsync: onSubmit, loading } = useRequest(
    async (data: AppTemplateSchemaType) => {
      if (!isPluginSystemTemplate && !workflowStr) {
        return Promise.reject('请先上传配置文件');
      }

      if (!data.type) {
        return Promise.reject('未识别到应用类型');
      }

      let workflow = data.workflow;
      if (!isPluginSystemTemplate) {
        try {
          workflow = JSON.parse(workflowStr);
        } catch {
          return Promise.reject('配置文件 JSON 格式错误');
        }
      }

      const pluginSystemTemplateConfigBody = {
        templateId: data.templateId,
        isActive: data.isActive,
        isPromoted: data.isPromoted,
        promoteTags: data.promoteTags,
        hideTags: data.hideTags,
        recommendText: data.recommendText
      };

      const fullTemplateBody = {
        ...pluginSystemTemplateConfigBody,
        name: data.name,
        intro: data.intro,
        avatar: data.avatar,
        tags: data.tags,
        author: data.author,
        type: data.type,
        userGuide: {
          type: data.userGuide?.type ?? 'markdown',
          content: data.userGuide?.content ?? '',
          link: data.userGuide?.link ?? ''
        },
        workflow
      };

      if (isEdit) {
        await putUpdateTemplate(
          isPluginSystemTemplate ? pluginSystemTemplateConfigBody : fullTemplateBody
        );
      } else {
        await postCreateTemplate(fullTemplateBody);
      }
    },
    {
      successToast: isEdit ? '模板更新成功' : '模板创建成功',
      onSuccess: () => {
        onSuccess();
        onClose();
      }
    }
  );

  useEffect(() => {
    try {
      setWorkflowStr(JSON.stringify(workflow, null, 2));
    } catch (err) {
      console.error('JSON 序列化失败:', err);
      setWorkflowStr('');
    }
  }, [workflow]);

  useEffect(() => {
    if (isPluginSystemTemplate || !workflowStr.trim()) {
      return;
    }

    try {
      const workflow = JSON.parse(workflowStr);
      setValue('type', getAppType(workflow));
    } catch {
      return;
    }
  }, [isPluginSystemTemplate, setValue, workflowStr]);

  return (
    <MyModal
      isOpen
      isCentered
      title="模板配置"
      maxW={isPluginSystemTemplate ? ['90vw', '520px'] : ['90vw', '900px']}
      w={'100%'}
      position={'relative'}
      footerStyles={{ justifyContent: 'space-between' }}
      footer={
        <>
          {isEdit && !isCommunity ? (
            <Button
              variant={'transparentDanger'}
              color={'red.600'}
              onClick={() => {
                return openDeleteConfirm({
                  onConfirm: () => onDelete({ id: defaultForm.templateId })
                })();
              }}
            >
              删除
            </Button>
          ) : (
            <Box />
          )}
          <Flex>
            <Button onClick={onClose} variant={'whiteBase'} mr={3}>
              取消
            </Button>
            <Button isLoading={loading} onClick={handleSubmit(onSubmit)}>
              确认
            </Button>
          </Flex>
        </>
      }
    >
      <Flex w={'full'} gap={8} h={isPluginSystemTemplate ? 'auto' : 560}>
        <Flex flexDirection={'column'} gap={6} w={'full'}>
          {isPluginSystemTemplate ? (
            <Box>
              <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'}>
                模板信息
              </Box>
              <Box mt={2} p={3} border={'1px solid'} borderColor={'myGray.200'} borderRadius={'md'}>
                <Flex alignItems={'center'}>
                  <Avatar
                    flexShrink={0}
                    src={avatar}
                    w={['36px', '40px']}
                    h={['36px', '40px']}
                    borderRadius={'md'}
                  />
                  <Box flex={1} minW={0} ml={3}>
                    <Flex alignItems={'center'} gap={2}>
                      <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} noOfLines={1}>
                        {watch('name')}
                      </Box>
                      <Box
                        flexShrink={0}
                        px={2}
                        py={'1px'}
                        borderRadius={'sm'}
                        bg={'myGray.100'}
                        color={'myGray.600'}
                        fontSize={'xs'}
                      >
                        系统
                      </Box>
                    </Flex>
                    <Box color={'myGray.500'} fontSize={'xs'} mt={1} noOfLines={2}>
                      {intro || '暂无介绍'}
                    </Box>
                  </Box>
                </Flex>
                <Flex mt={3} gap={2} flexWrap={'wrap'}>
                  <Box
                    px={2}
                    py={1}
                    borderRadius={'sm'}
                    bg={'myGray.100'}
                    color={'myGray.600'}
                    fontSize={'xs'}
                  >
                    {templateTypeName ? t(templateTypeName as any) : '未分类'}
                  </Box>
                  <Box
                    px={2}
                    py={1}
                    borderRadius={'sm'}
                    bg={'myGray.100'}
                    color={'myGray.600'}
                    fontSize={'xs'}
                  >
                    {type ? appTypeMap[type as AppTypeEnum] : '未识别到应用属性'}
                  </Box>
                </Flex>
              </Box>
            </Box>
          ) : (
            <Box>
              <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'}>
                取个名字
              </Box>
              <Flex mt={2} alignItems={'center'}>
                <MyTooltip label={'点击上传头像'}>
                  {avatar ? (
                    <Avatar
                      flexShrink={0}
                      src={avatar}
                      w={['28px', '36px']}
                      h={['28px', '36px']}
                      borderRadius={'md'}
                      cursor={'pointer'}
                      onClick={handleFileSelectorOpen}
                    />
                  ) : (
                    <Box
                      w={['28px', '36px']}
                      h={['28px', '36px']}
                      cursor={'pointer'}
                      borderRadius={'md'}
                      border={'1px dashed'}
                      borderColor={'myGray.300'}
                      color={'myGray.500'}
                      display={'flex'}
                      alignItems={'center'}
                      justifyContent={'center'}
                      _hover={{ color: 'primary.600', borderColor: 'primary.300' }}
                      onClick={handleFileSelectorOpen}
                    >
                      <MyIcon name="export" w={'16px'} h={'16px'} />
                    </Box>
                  )}
                </MyTooltip>
                <Input
                  flex={1}
                  ml={3}
                  autoFocus
                  placeholder="请输入模板名称"
                  {...register('name', {
                    required: '应用名不能为空'
                  })}
                />
              </Flex>
            </Box>
          )}
          <Box>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
              展示卡片
            </Box>
            <LeftRadio
              list={[
                {
                  title: '精选应用',
                  value: true,
                  children: <Box as="img" src="/imgs/templatePromoted.svg" w="100%" />
                },
                {
                  title: '普通应用',
                  value: false,
                  children: <Box as="img" src="/imgs/templatePreview.svg" w="100%" />
                }
              ]}
              value={isPromoted ?? false}
              onChange={(e) => setValue('isPromoted', e)}
              gridTemplateColumns={'repeat(2, 1fr)'}
            />
          </Box>
          {/* 介绍/推荐语 */}
          {isPromoted ? (
            <Box>
              <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                推荐语
              </Box>
              <Input
                value={recommendText || ''}
                onChange={(e) => setValue('recommendText', e.target.value)}
                maxLength={16}
                placeholder={'为这个模板添加一个推荐语（16字以内）'}
              />
            </Box>
          ) : isPluginSystemTemplate ? null : (
            <Box>
              <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
                简介
              </Box>
              <Textarea
                value={intro || ''}
                onChange={(e) => setValue('intro', e.target.value)}
                maxLength={100}
                placeholder={'为这个模板添加一个介绍（100字以内）'}
              />
            </Box>
          )}
          {!isPluginSystemTemplate && (
            <HStack>
              <Box color={'myGray.900'} flex={'0 0 140px'} fontSize={'sm'} fontWeight={'medium'}>
                属性
              </Box>
              <Box flex={1}>
                <MySelect
                  value={templateType}
                  list={templateTypes.map((templateType) => ({
                    label: t(templateType.typeName as any),
                    value: templateType.typeId
                  }))}
                  onChange={(e) => {
                    setValue('tags', [e as any]);
                  }}
                />
              </Box>
            </HStack>
          )}
          <HStack>
            <Box color={'myGray.900'} flex={1} fontSize={'sm'} fontWeight={'medium'}>
              是否启用
            </Box>
            <Switch {...register('isActive')} />
          </HStack>
          <Box>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
              推荐标签
            </Box>
            <Box color={'myGray.500'} fontSize={'xs'} mb={2}>
              {'拥有以下标签的用户会看到"推荐"标识'}
            </Box>
            <MultipleSelect
              list={userTagsList}
              value={promoteTags}
              onSelect={(val) => setValue('promoteTags', val)}
              placeholder="选择用户标签"
              w={'100%'}
            />
          </Box>
          <Box>
            <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} mb={2}>
              隐藏标签
            </Box>
            <Box color={'myGray.500'} fontSize={'xs'} mb={2}>
              拥有以下标签的用户将完全看不到此模板
            </Box>
            <MultipleSelect
              list={userTagsList}
              value={hideTags}
              onSelect={(val) => setValue('hideTags', val)}
              placeholder="选择用户标签"
              w={'100%'}
            />
          </Box>
        </Flex>
        {!isPluginSystemTemplate && (
          <Flex w={'full'} flexDirection={'column'} gap={6}>
            <HStack>
              {isDragging ? (
                <Flex
                  align={'center'}
                  justify={'center'}
                  w={'full'}
                  h={'136px'}
                  borderRadius={'md'}
                  border={'1px dashed'}
                  borderColor={'myGray.400'}
                  onDragEnter={handleDragEnter}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onDragLeave={handleDragLeave}
                >
                  <Flex align={'center'} justify={'center'} flexDir={'column'} gap={'0.62rem'}>
                    <MyIcon name={'configmap'} w={'1.5rem'} color={'myGray.500'} />
                    <Box color={'myGray.600'} fontSize={'mini'}>
                      文件将覆盖当前内容
                    </Box>
                  </Flex>
                </Flex>
              ) : (
                <Box w={'full'}>
                  <Flex justify={'space-between'} align={'center'} mb={2}>
                    <Box fontSize={'sm'} fontWeight={'500'}>
                      配置文件
                    </Box>
                    <Button onClick={onOpenSelectConfigFile} variant={'whiteBase'} p={0}>
                      <Flex
                        px={'14px'}
                        color={'myGray.600'}
                        fontSize={'mini'}
                        h={'30px'}
                        alignItems={'center'}
                        gap={1.5}
                      >
                        <MyIcon name={'file/uploadFile'} w={'1rem'} />
                        上传文件
                      </Flex>
                    </Button>
                  </Flex>
                  <Box
                    onDragEnter={handleDragEnter}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onDragLeave={handleDragLeave}
                  >
                    <Textarea
                      border={'1px solid'}
                      borderRadius={'md'}
                      borderColor={'myGray.200'}
                      value={workflowStr}
                      placeholder={isPc ? '粘贴配置或拖入 JSON 文件' : '粘贴配置'}
                      rows={4}
                      minH={'100px'}
                      onChange={(e) => {
                        setWorkflowStr(e.target.value);
                      }}
                    />
                  </Box>
                </Box>
              )}
            </HStack>
            <HStack>
              <Flex color={'myGray.900'} flex={1} fontSize={'sm'} fontWeight={'medium'}>
                <Box>应用类型</Box>
                <Box color={'myGray.500'}>{'(自动识别)'}</Box>
              </Flex>
              <Flex fontSize={'sm'} fontWeight={'medium'}>
                {type ? appTypeMap[type as AppTypeEnum] : '未识别到应用属性'}
              </Flex>
            </HStack>
            <Box>
              <Flex mb={'9px'} alignItems={'center'}>
                <Box color={'myGray.900'} fontSize={'sm'} fontWeight={'medium'} flex={1}>
                  使用说明
                </Box>
                <FillRowTabs
                  list={[
                    { label: '文本', value: 'markdown' },
                    { label: '链接', value: 'link' }
                  ]}
                  value={userGuideType}
                  onChange={(e) => setValue('userGuide.type', e as 'markdown' | 'link')}
                  py={'3px'}
                  px={2}
                />
              </Flex>
              {userGuideType === 'markdown' ? (
                <Textarea
                  {...register('userGuide.content')}
                  placeholder={'使用 markdown 语法'}
                  minH={'294px'}
                />
              ) : (
                <Input {...register('userGuide.link')} placeholder={'请输入链接'} />
              )}
            </Box>
          </Flex>
        )}
      </Flex>

      <ConfigFile onSelect={onSelectConfigFile} />
      <AvatarUploader />
      <DeleteConfirmModal />
    </MyModal>
  );
};

export default dynamic(() => Promise.resolve(TemplateConfigModal), {
  ssr: false
});
