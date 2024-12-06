import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useCallback, useState } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import AppTypeTag from './TypeTag';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList
} from '@/web/core/app/api/template';
import { TemplateMarketListItemType } from '@fastgpt/global/core/workflow/type';
import { postCreateApp } from '@/web/core/app/api';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRouter } from 'next/router';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import SearchInput from '../../../../../../../packages/web/components/common/Input/SearchInput/index';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type TemplateAppType = AppTypeEnum | 'all';

const TemplateMarketModal = ({
  defaultType = 'all',
  onClose
}: {
  defaultType?: TemplateAppType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const templateTags = [
    {
      id: AppTemplateTypeEnum.recommendation,
      label: t('app:templateMarket.templateTags.Recommendation')
    },
    {
      id: AppTemplateTypeEnum.writing,
      label: t('app:templateMarket.templateTags.Writing')
    },
    {
      id: AppTemplateTypeEnum.imageGeneration,
      label: t('app:templateMarket.templateTags.Image_generation')
    },
    {
      id: AppTemplateTypeEnum.webSearch,
      label: t('app:templateMarket.templateTags.Web_search')
    },
    {
      id: AppTemplateTypeEnum.roleplay,
      label: t('app:templateMarket.templateTags.Roleplay')
    },
    {
      id: AppTemplateTypeEnum.officeServices,
      label: t('app:templateMarket.templateTags.Office_services')
    }
  ];

  const { parentId } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();
  const { isPc } = useSystem();

  const [currentTag, setCurrentTag] = useState(templateTags[0].id);
  const [currentAppType, setCurrentAppType] = useState<TemplateAppType>(defaultType);
  const [currentSearch, setCurrentSearch] = useState('');

  const { data: templateList = [], loading: isLoadingTemplates } = useRequest2(
    getTemplateMarketItemList,
    {
      manual: false
    }
  );

  const { runAsync: onUseTemplate, loading: isCreating } = useRequest2(
    async (id: string) => {
      const templateDetail = await getTemplateMarketItemDetail({ templateId: id });
      return postCreateApp({
        parentId,
        avatar: templateDetail.avatar,
        name: templateDetail.name,
        type: templateDetail.type,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig
      });
    },
    {
      onSuccess(id: string) {
        onClose();
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:common.Create Success'),
      errorToast: t('common:common.Create Failed')
    }
  );

  const { run: handleScroll } = useRequest2(
    async () => {
      let firstVisibleTitle: any = null;

      templateTags
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
        setCurrentTag(firstVisibleTitle.id);
      }
    },
    {
      throttleWait: 100
    }
  );

  const TemplateCard = useCallback(
    ({ item }: { item: TemplateMarketListItemType }) => {
      const { t } = useTranslation();

      return (
        <MyBox
          key={item.id}
          lineHeight={1.5}
          h="100%"
          pt={4}
          pb={3}
          px={4}
          border={'base'}
          boxShadow={'2'}
          bg={'white'}
          borderRadius={'10px'}
          position={'relative'}
          display={'flex'}
          flexDirection={'column'}
          _hover={{
            borderColor: 'primary.300',
            boxShadow: '1.5',
            '& .buttons': {
              display: 'flex'
            }
          }}
        >
          <HStack>
            <Avatar src={item.avatar} borderRadius={'sm'} w={'1.5rem'} h={'1.5rem'} />
            <Box flex={'1 0 0'} color={'myGray.900'} fontWeight={500}>
              {item.name}
            </Box>
            <Box mr={'-1rem'}>
              <AppTypeTag type={item.type} />
            </Box>
          </HStack>
          <Box
            flex={['1 0 48px', '1 0 56px']}
            mt={3}
            pr={1}
            textAlign={'justify'}
            wordBreak={'break-all'}
            fontSize={'xs'}
            color={'myGray.500'}
          >
            <Box className={'textEllipsis2'}>{item.intro || t('app:templateMarket.no_intro')}</Box>
          </Box>

          <Box w={'full'} fontSize={'mini'}>
            <Box color={'myGray.500'}>{`by ${item.author || feConfigs.systemTitle}`}</Box>
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
              bottom={0}
              height={'40px'}
              bg={'white'}
              zIndex={1}
            >
              <Button
                variant={'whiteBase'}
                h={'1.75rem'}
                borderRadius={'xl'}
                w={'40%'}
                onClick={() => onUseTemplate(item.id)}
              >
                {t('app:templateMarket.Use')}
              </Button>
            </Box>
          </Box>
        </MyBox>
      );
    },
    [onUseTemplate]
  );

  return (
    <Modal
      isOpen={true}
      onClose={() => onClose && onClose()}
      autoFocus={false}
      blockScrollOnMount={false}
      closeOnOverlayClick={false}
      isCentered
    >
      <ModalOverlay />
      <ModalContent
        w={['90vw', '80vw']}
        maxW={'90vw'}
        position={'relative'}
        h={['90vh']}
        boxShadow={'7'}
        overflow={'hidden'}
      >
        <ModalHeader
          display={'flex'}
          alignItems={'center'}
          py={'10px'}
          fontSize={'md'}
          fontWeight={'600'}
          gap={2}
          position={'relative'}
        >
          <Avatar src={'/imgs/app/templateFill.svg'} w={'2rem'} objectFit={'fill'} />
          <Box color={'myGray.900'}>{t('app:template_market')}</Box>

          <Box flex={'1'} />

          <MySelect
            h={'8'}
            value={currentAppType}
            onchange={(value) => {
              setCurrentAppType(value as AppTypeEnum | 'all');
            }}
            bg={'myGray.100'}
            minW={'7rem'}
            borderRadius={'sm'}
            list={[
              { label: t('app:type.All'), value: 'all' },
              { label: t('app:type.Simple bot'), value: AppTypeEnum.simple },
              { label: t('app:type.Workflow bot'), value: AppTypeEnum.workflow },
              { label: t('app:type.Plugin'), value: AppTypeEnum.plugin }
            ]}
          />
          <ModalCloseButton position={'relative'} fontSize={'xs'} top={0} right={0} />

          {isPc && (
            <Box
              width="15rem"
              position={'absolute'}
              top={'50%'}
              left={'50%'}
              transform={'translate(-50%,-50%)'}
            >
              <SearchInput
                pl={7}
                placeholder={t('app:templateMarket.Search_template')}
                value={currentSearch}
                onChange={(e) => setCurrentSearch(e.target.value)}
                h={8}
                bg={'myGray.50'}
                maxLength={20}
                borderRadius={'sm'}
              />
            </Box>
          )}
        </ModalHeader>
        <MyBox isLoading={isCreating || isLoadingTemplates} flex={'1 0 0'} overflow={'overlay'}>
          <ModalBody
            h={'100%'}
            display={'flex'}
            bg={'myGray.100'}
            overflow={'auto'}
            gap={5}
            onScroll={handleScroll}
            px={0}
            pt={5}
          >
            {isPc && (
              <Flex pl={5} flexDirection={'column'} gap={3}>
                {templateTags.map((item) => {
                  return (
                    <Box
                      key={item.id}
                      cursor={'pointer'}
                      {...(item.id === currentTag && !currentSearch
                        ? {
                            bg: 'primary.1',
                            color: 'primary.600'
                          }
                        : {
                            _hover: { bg: 'primary.1' },
                            color: 'myGray.600'
                          })}
                      w={'9.5rem'}
                      px={4}
                      py={2}
                      rounded={'sm'}
                      fontSize={'sm'}
                      fontWeight={500}
                      onClick={() => {
                        setCurrentTag(item.id);
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
                <Box flex={1} />

                {feConfigs?.appTemplateCourse && (
                  <Flex
                    alignItems={'center'}
                    cursor={'pointer'}
                    _hover={{
                      color: 'primary.600'
                    }}
                    py={2}
                    fontWeight={500}
                    rounded={'sm'}
                    fontSize={'sm'}
                    onClick={() => window.open(feConfigs.appTemplateCourse)}
                    gap={1}
                  >
                    <MyIcon name={'common/upRightArrowLight'} w={'1rem'} />
                    <Box>{t('common:contribute_app_template')}</Box>
                  </Flex>
                )}
              </Flex>
            )}

            <Box pl={[3, 0]} pr={[3, 5]} pt={1} flex={'1'} h={'100%'} overflow={'auto'}>
              {currentSearch ? (
                <>
                  <Box fontSize={'lg'} color={'myGray.900'} mb={4}>
                    {t('common:xx_search_result', { key: currentSearch })}
                  </Box>
                  {(() => {
                    const templates = templateList.filter((template) =>
                      `${template.name}${template.intro}`.includes(currentSearch)
                    );

                    if (templates.length > 0) {
                      return (
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
                          {templates.map((item) => (
                            <TemplateCard key={item.id} item={item} />
                          ))}
                        </Grid>
                      );
                    }

                    return <EmptyTip text={t('app:template_market_empty_data')} />;
                  })()}
                </>
              ) : (
                <>
                  {templateTags.map((item) => {
                    const currentTemplates = templateList
                      ?.filter((template) => template.tags.includes(item.id))
                      .filter((template) => {
                        if (currentAppType === 'all') return true;
                        return template.type === currentAppType;
                      });

                    if (currentTemplates.length === 0) return null;

                    return (
                      <Box key={item.id}>
                        <Box
                          id={item.id}
                          fontSize={['md', 'lg']}
                          color={'myGray.900'}
                          mb={4}
                          fontWeight={500}
                        >
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
                            <TemplateCard key={item.id} item={item} />
                          ))}
                        </Grid>
                      </Box>
                    );
                  })}
                </>
              )}
            </Box>
          </ModalBody>
        </MyBox>
      </ModalContent>
    </Modal>
  );
};

export default TemplateMarketModal;
