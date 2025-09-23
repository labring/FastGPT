import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalBody,
  Input,
  Grid,
  Card,
  Textarea,
  ModalFooter
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { postCreateApp } from '@/web/core/app/api';
import { useRouter } from 'next/router';
import { emptyTemplates, parsePluginFromCurlString } from '@/web/core/app/templates';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import { appTypeMap } from '@/pageComponents/app/constants';

type FormType = {
  avatar: string;
  name: string;
  curlContent: string;
};

export type CreateAppType = AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;

const CreateModal = ({ onClose, type }: { type: CreateAppType; onClose: () => void }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const { isPc } = useSystem();
  const { feConfigs } = useSystemStore();

  const [currentCreateType, setCurrentCreateType] = useState<'template' | 'curl'>('template');
  const isTemplateMode = currentCreateType === 'template';

  const typeData = appTypeMap[type];
  const { data: templateList = [], loading: isRequestTemplates } = useRequest2(
    () => getTemplateMarketItemList({ isQuickTemplate: true, type }),
    {
      manual: false
    }
  );

  const { register, setValue, watch, handleSubmit } = useForm<FormType>({
    defaultValues: {
      avatar: typeData.avatar,
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
      // From empty template
      if (!templateId && currentCreateType !== 'curl') {
        return postCreateApp({
          parentId,
          avatar: avatar,
          name: name,
          type,
          modules: emptyTemplates[type].nodes,
          edges: emptyTemplates[type].edges,
          chatConfig: emptyTemplates[type].chatConfig
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
        parentId,
        avatar: appAvatar,
        name: name,
        type,
        modules: workflow.nodes || [],
        edges: workflow.edges || [],
        chatConfig: workflow.chatConfig || {}
      });
    },
    {
      onSuccess(id: string) {
        router.push(`/app/detail?appId=${id}`);
        loadMyApps();
        onClose();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  return (
    <MyModal
      iconSrc={typeData.icon}
      title={t(typeData.title)}
      isOpen
      isCentered={!isPc}
      maxW={['90vw', '40rem']}
      isLoading={isCreating || isRequestTemplates}
    >
      <ModalBody>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('common:input_name')}
        </Box>
        <Flex mt={2} alignItems={'center'}>
          <MyTooltip label={t('common:set_avatar')}>
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '36px']}
              h={['28px', '36px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={3}
            autoFocus
            bg={'myWhite.600'}
            {...register('name', {
              required: t('common:core.app.error.App name can not be empty')
            })}
          />
        </Flex>

        <Flex mt={[4, 7]} mb={3}>
          {type === AppTypeEnum.plugin ? (
            <FillRowTabs
              list={[
                { label: t('app:create_by_template'), value: 'template' },
                { label: t('app:create_by_curl'), value: 'curl' }
              ]}
              value={currentCreateType}
              fontSize={'xs'}
              onChange={(e) => setCurrentCreateType(e as 'template' | 'curl')}
            />
          ) : (
            <Box color={'myGray.900'} fontWeight={'bold'} fontSize={'sm'}>
              {t('app:create_by_template')}
            </Box>
          )}
          <Box flex={1} />
          {isTemplateMode && (
            <Flex
              onClick={() => {
                router.push({
                  pathname: '/dashboard/templateMarket',
                  query: {
                    appType: type,
                    parentId
                  }
                });
                onClose();
              }}
              alignItems={'center'}
              cursor={'pointer'}
              color={'myGray.600'}
              fontSize={'xs'}
              _hover={{ color: 'blue.700' }}
            >
              {t('common:core.app.switch_to_template_market')}
              <ChevronRightIcon w={4} h={4} />
            </Flex>
          )}
        </Flex>

        {isTemplateMode ? (
          <Grid
            userSelect={'none'}
            gridTemplateColumns={
              templateList.length > 0 ? ['repeat(1,1fr)', 'repeat(2,1fr)'] : '1fr'
            }
            gridGap={[2, 4]}
          >
            <Card
              borderWidth={'1px'}
              borderRadius={'md'}
              cursor={'pointer'}
              boxShadow={'3'}
              display={'flex'}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
              color={'myGray.500'}
              borderColor={'myGray.200'}
              h={'8.25rem'}
              _hover={{
                color: 'primary.700',
                borderColor: 'primary.300'
              }}
              onClick={handleSubmit((data) => onclickCreate(data))}
            >
              <MyIcon name={'common/addLight'} w={'1.5rem'} />
              <Box fontSize={'sm'} mt={2}>
                {t(typeData.emptyCreateText)}
              </Box>
            </Card>
            {templateList.map((item) => (
              <Card
                key={item.templateId}
                p={4}
                borderRadius={'md'}
                borderWidth={'1px'}
                borderColor={'myGray.200'}
                boxShadow={'3'}
                h={'8.25rem'}
                _hover={{
                  borderColor: 'primary.300',
                  '& .buttons': {
                    display: 'flex'
                  }
                }}
                display={'flex'}
                flexDirection={'column'}
              >
                <Flex alignItems={'center'}>
                  <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} />
                  <Box ml={3} color={'myGray.900'} fontWeight={500}>
                    {t(item.name as any)}
                  </Box>
                </Flex>
                <Box fontSize={'xs'} mt={2} color={'myGray.600'} flex={1}>
                  {t(item.intro as any)}
                </Box>
                <Box w={'full'} fontSize={'mini'}>
                  <Box color={'myGray.500'}>{`By ${item.author || feConfigs.systemTitle}`}</Box>
                  <Box
                    className="buttons"
                    display={'none'}
                    justifyContent={'center'}
                    alignItems={'center'}
                    position={'absolute'}
                    borderRadius={'lg'}
                    w={'full'}
                    h={'full'}
                    left={0}
                    right={0}
                    bottom={1}
                    height={'40px'}
                    bg={'white'}
                    zIndex={1}
                  >
                    <Button
                      variant={'whiteBase'}
                      h={6}
                      borderRadius={'sm'}
                      w={'40%'}
                      onClick={handleSubmit((data) => onclickCreate(data, item.templateId))}
                    >
                      {t('app:templateMarket.Use')}
                    </Button>
                  </Box>
                </Box>
              </Card>
            ))}
          </Grid>
        ) : (
          <Box>
            <Textarea
              placeholder={t('app:oaste_curl_string')}
              w={'560px'}
              h={'260px'}
              bg={'myGray.50'}
              {...register('curlContent', { required: true })}
            />
          </Box>
        )}
      </ModalBody>

      <ModalFooter gap={4}>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:Close')}
        </Button>
        {currentCreateType === 'curl' && (
          <Button variant={'primary'} onClick={handleSubmit((data) => onclickCreate(data))}>
            {t('common:Confirm')}
          </Button>
        )}
      </ModalFooter>

      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
    </MyModal>
  );
};

export default CreateModal;
