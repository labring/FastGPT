import {
  Avatar,
  Box,
  Button,
  Center,
  Flex,
  Grid,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  ModalBody,
  ModalCloseButton,
  ModalHeader,
  Spinner
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useState } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import AppTypeTag from './TypeTag';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { TemplateMarketListItemType } from '@fastgpt/global/core/workflow/type';
import { postCreateApp } from '@/web/core/app/api';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRouter } from 'next/router';
import { SearchIcon } from '@chakra-ui/icons';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { debounce, throttle } from 'lodash';
import { useTranslation } from 'react-i18next';
import { useI18n } from '@/web/context/I18n';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const templateTypes = [
  {
    id: 'recommendation',
    label: '推荐'
  },
  {
    id: 'writing',
    label: '文本创作'
  },
  {
    id: 'image-generation',
    label: '图片生成'
  },
  {
    id: 'web-search',
    label: '联网搜索'
  },
  {
    id: 'roleplay',
    label: '角色扮演'
  },
  {
    id: 'office-services',
    label: '办公服务'
  }
];

const TemplateMarketModal = ({ onClose }: { onClose: () => void }) => {
  const [currentType, setCurrentType] = useState(templateTypes[0].id);
  const [currentAppType, setCurrentAppType] = useState<AppTypeEnum | 'all'>('all');
  const [currentSearch, setCurrentSearch] = useState('');
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { isPc } = useSystemStore();

  const { data: templateData, loading: isLoadingTemplates } = useRequest2(
    async () => {
      return getTemplateMarketItemList();
    },
    {
      manual: false
    }
  );

  const { mutate: onUseTemplate, isLoading: creating } = useRequest({
    mutationFn: async (data) => {
      const templateDetail = await getTemplateMarketItemDetail({ templateId: data.id });
      return postCreateApp({
        parentId,
        avatar: templateDetail.avatar,
        name: templateDetail.name,
        type: templateDetail.type,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || []
      });
    },
    onSuccess(id: string) {
      router.push(`/app/detail?appId=${id}`);
      loadMyApps();
    },
    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });

  const handleScroll = throttle(() => {
    let firstVisibleTitle: any = null;

    templateTypes
      .map((type) => type.id)
      .forEach((type: string) => {
        const element = document.getElementById(type);
        if (!element) return;

        const elementRect = element.getBoundingClientRect();
        if (elementRect.top <= window.innerHeight && elementRect.bottom >= 0) {
          if (
            !firstVisibleTitle ||
            elementRect.top < firstVisibleTitle.getBoundingClientRect().top
          ) {
            firstVisibleTitle = element;
          }
        }
      });

    if (firstVisibleTitle) {
      setCurrentType(firstVisibleTitle.id);
    }
  }, 100);

  return (
    <MyModal
      isOpen
      onClose={onClose}
      customModalHeader={
        <ModalHeader
          display={'flex'}
          alignItems={'center'}
          roundedTop={'lg'}
          py={'10px'}
          fontSize={'md'}
          fontWeight={'bold'}
        >
          <HStack w={'full'} justifyContent={'space-between'} display={'flex'}>
            <Box>
              <MyIcon mr={3} name={'core/app/type/templateFill'} w={'20px'} />
              {appT('template.templateMarket')}
            </Box>
            {isPc && (
              <InputGroup width="300px" ml={12}>
                <InputLeftElement pointerEvents="none" fontSize={'sm'} top={'-1'}>
                  <SearchIcon color="gray.300" />
                </InputLeftElement>
                <Input
                  w={56}
                  h={8}
                  placeholder={appT('template.Search template')}
                  onChange={debounce((e) => {
                    setCurrentSearch(e.target.value);
                  }, 200)}
                  bg={'myGray.100'}
                />
              </InputGroup>
            )}
            <Flex gap={4}>
              <MySelect
                h={8}
                value={currentAppType}
                onchange={(value) => {
                  setCurrentAppType(value as AppTypeEnum | 'all');
                }}
                bg={'myGray.100'}
                list={[
                  { label: appT('type.All'), value: 'all' },
                  { label: appT('type.Simple bot'), value: AppTypeEnum.simple },
                  { label: appT('type.Workflow bot'), value: AppTypeEnum.workflow },
                  { label: appT('type.Plugin'), value: AppTypeEnum.plugin }
                ]}
              />
              <ModalCloseButton position={'relative'} fontSize={'xs'} top={0} right={0} />
            </Flex>
          </HStack>
        </ModalHeader>
      }
      w={['90vw', '75vw']}
      maxW={['90vw', '75vw']}
      h={['90vh', '80vh']}
      position={'relative'}
    >
      <ModalBody
        flex={'1 0 0'}
        bg={'myWhite.600'}
        overflow={'auto'}
        roundedBottom={'md'}
        onScroll={handleScroll}
      >
        <Flex h={'full'}>
          <Box position={'absolute'}>
            {isPc &&
              templateTypes.map((item) => {
                if (
                  templateData
                    ?.filter((template) => template.tags?.map((tag) => tag.id).includes(item.id))
                    .filter((templateData) => {
                      if (currentAppType === 'all') return true;
                      return templateData.type === currentAppType;
                    })
                    .filter((template) => template.name.includes(currentSearch)).length === 0
                )
                  return null;
                return (
                  <Box
                    key={item.id}
                    cursor={'pointer'}
                    bg={item.id === currentType ? '#3370FF1A' : 'myWhite.600'}
                    color={item.id === currentType ? 'blue.600' : 'myGray.800'}
                    _hover={{ bg: '#3370FF1A', color: 'blue.600' }}
                    w={'150px'}
                    px={4}
                    py={2}
                    my={3}
                    rounded={'md'}
                    fontSize={'sm'}
                    onClick={() => {
                      setCurrentType(item.id);
                      const anchor = document.getElementById(item.id);
                      if (anchor) {
                        anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
                      }
                    }}
                  >
                    {item.label}
                  </Box>
                );
              })}
          </Box>
          <Box ml={isPc ? '178px' : 0} w={'full'}>
            {isLoadingTemplates || creating ? (
              <Center flex={'1 0 0'} h={'full'}>
                <Spinner size={'lg'} />
              </Center>
            ) : (
              <Box>
                {templateTypes.map((item) => {
                  const currentTemplates = templateData
                    ?.filter((template) => template.tags?.map((tag) => tag.id).includes(item.id))
                    .filter((template) => {
                      if (currentAppType === 'all') return true;
                      return template.type === currentAppType;
                    })
                    .filter((template) => template.name.includes(currentSearch));
                  if (!currentTemplates || currentTemplates.length === 0) return null;
                  return (
                    <>
                      <Box key={item.id} id={item.id} fontSize={'18px'} color={'myGray.900'} mb={4}>
                        {item.label}
                      </Box>
                      <Grid
                        gridTemplateColumns={[
                          '1fr',
                          'repeat(2,1fr)',
                          'repeat(3,1fr)',
                          'repeat(3,1fr)',
                          'repeat(4,1fr)'
                        ]}
                        gridGap={4}
                        alignItems={'stretch'}
                        pb={5}
                      >
                        {currentTemplates.map((item) => (
                          <TemplateCard key={item.id} item={item} onUseTemplate={onUseTemplate} />
                        ))}
                      </Grid>
                    </>
                  );
                })}
              </Box>
            )}
          </Box>
        </Flex>
      </ModalBody>
    </MyModal>
  );
};

export const TemplateCard = ({
  item,
  onUseTemplate
}: {
  item: TemplateMarketListItemType;
  onUseTemplate: (data: any) => void;
}) => {
  const { appT } = useI18n();

  return (
    <MyBox
      key={item.id}
      lineHeight={1.5}
      h="100%"
      pt={5}
      pb={3}
      px={5}
      border={'base'}
      boxShadow={'2'}
      bg={'white'}
      borderRadius={'lg'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
      _hover={{
        borderColor: 'primary.300',
        boxShadow: '1.5',
        '& .author': {
          display: 'none'
        },
        '& .buttons': {
          display: 'flex'
        }
      }}
      onClick={() => {}}
    >
      <HStack>
        <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} h={'1.5rem'} />
        <Box flex={'1 0 0'} color={'myGray.900'}>
          {item.name}
        </Box>
        <Box mr={'-1.25rem'}>
          <AppTypeTag type={item.type} />
        </Box>
      </HStack>
      <Box
        flex={['1 0 48px', '1 0 56px']}
        mt={3}
        pr={8}
        textAlign={'justify'}
        wordBreak={'break-all'}
        fontSize={'xs'}
        color={'myGray.500'}
      >
        <Box className={'textEllipsis2'}>{item.intro || '还没写介绍~'}</Box>
      </Box>
      <Flex
        alignItems={'center'}
        justifyContent={'space-between'}
        fontSize={'mini'}
        color={'myGray.500'}
      >
        <HStack w={'full'} h={'24px'}>
          <Flex className="author">
            <Avatar src={item.authorAvatar} borderRadius={'sm'} w={'1rem'} h={'1.25rem'} />
            <Box ml={1.5}>{item.author}</Box>
          </Flex>
          <Flex
            className="buttons"
            display={'none'}
            justifyContent={'center'}
            w={'full'}
            gap={2}
            h={'full'}
          >
            <Button variant={'whiteBase'} h={'full'} onClick={() => onUseTemplate(item)}>
              {appT('Create bot')}
            </Button>
          </Flex>
        </HStack>
      </Flex>
    </MyBox>
  );
};

export default TemplateMarketModal;
