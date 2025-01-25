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
import { useCallback, useMemo, useState } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import AppTypeTag from './TypeTag';
import { AppTemplateTypeEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  getTemplateMarketItemDetail,
  getTemplateMarketItemList,
  getTemplateTagList
} from '@/web/core/app/api/template';
import { postCreateApp } from '@/web/core/app/api';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { useRouter } from 'next/router';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput/index';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { AppTemplateSchemaType, TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';
import { form2AppWorkflow } from '@/web/core/app/utils';

type TemplateAppType = AppTypeEnum | 'all';

const recommendTag: TemplateTypeSchemaType = {
  typeId: AppTemplateTypeEnum.recommendation,
  typeName: i18nT('app:templateMarket.templateTags.Recommendation'),
  typeOrder: 0
};

const TemplateMarketModal = ({
  defaultType = 'all',
  onClose
}: {
  defaultType?: TemplateAppType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const { parentId } = useContextSelector(AppListContext, (v) => v);
  const router = useRouter();
  const { isPc } = useSystem();

  const [currentTag, setCurrentTag] = useState<string>(AppTemplateTypeEnum.recommendation);
  const [currentAppType, setCurrentAppType] = useState<TemplateAppType>(defaultType);
  const [currentSearch, setCurrentSearch] = useState('');

  const { data: templateList = [], loading: isLoadingTemplates } = useRequest2(
    () => getTemplateMarketItemList({ type: currentAppType }),
    {
      manual: false,
      refreshDeps: [currentAppType]
    }
  );

  const { data: templateTags = [], loading: isLoadingTags } = useRequest2(
    () => getTemplateTagList().then((res) => [recommendTag, ...res]),
    {
      manual: false
    }
  );
  // Batch by tags
  const filterTemplateTags = useMemo(() => {
    return templateTags
      .map((tag) => {
        const templates = templateList.filter((template) => template.tags.includes(tag.typeId));
        return {
          ...tag,
          templates
        };
      })
      .filter((item) => item.templates.length > 0);
  }, [templateList, templateTags]);

  const { runAsync: onUseTemplate, loading: isCreating } = useRequest2(
    async (template: AppTemplateSchemaType) => {
      const templateDetail = await getTemplateMarketItemDetail(template.templateId);
      let workflow = templateDetail.workflow;
      if (templateDetail.type === AppTypeEnum.simple) {
        workflow = form2AppWorkflow(workflow, t);
      }
      return postCreateApp({
        parentId,
        avatar: template.avatar,
        name: template.name,
        type: template.type as AppTypeEnum,
        modules: workflow.nodes || [],
        edges: workflow.edges || [],
        chatConfig: workflow.chatConfig
      }).then((res) => {
        webPushTrack.useAppTemplate({
          id: res,
          name: template.name
        });

        return res;
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

      filterTemplateTags
        .map((type) => type.typeId)
        .forEach((type) => {
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
      throttleWait: 100,
      refreshDeps: [filterTemplateTags.length]
    }
  );

  const TemplateCard = useCallback(
    ({ item }: { item: AppTemplateSchemaType }) => {
      const { t } = useTranslation();

      return (
        <MyBox
          key={item.templateId}
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
              <AppTypeTag type={item.type as AppTypeEnum} />
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
            <Flex
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
              gap={2}
            >
              {((item.userGuide?.type === 'markdown' && item.userGuide?.content) ||
                (item.userGuide?.type === 'link' && item.userGuide?.link)) && (
                <UseGuideModal
                  title={item.name}
                  iconSrc={item.avatar}
                  text={item.userGuide?.content}
                  link={item.userGuide?.link}
                >
                  {({ onClick }) => (
                    <Button variant={'whiteBase'} h={6} rounded={'sm'} onClick={onClick}>
                      {t('app:templateMarket.template_guide')}
                    </Button>
                  )}
                </UseGuideModal>
              )}
              <Button
                variant={'whiteBase'}
                h={6}
                rounded={'sm'}
                onClick={() => onUseTemplate(item)}
              >
                {t('app:templateMarket.Use')}
              </Button>
            </Flex>
          </Box>
        </MyBox>
      );
    },
    [feConfigs.systemTitle, onUseTemplate]
  );

  const isLoading = isLoadingTags || isLoadingTemplates || isCreating;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
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

          <MySelect<TemplateAppType>
            h={'8'}
            value={currentAppType}
            onchange={(value) => {
              setCurrentAppType(value);
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
        <MyBox isLoading={isLoading} flex={'1 0 0'} h="0">
          <ModalBody
            h={'100%'}
            display={'flex'}
            bg={'myGray.100'}
            overflow={'auto'}
            gap={5}
            px={0}
            pt={5}
          >
            {isPc && (
              <Flex pl={5} flexDirection={'column'} gap={3}>
                {filterTemplateTags.map((item) => {
                  return (
                    <Box
                      key={item.typeId}
                      cursor={'pointer'}
                      {...(item.typeId === currentTag && !currentSearch
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
                        setCurrentTag(item.typeId);
                        const anchor = document.getElementById(item.typeId);
                        if (anchor) {
                          anchor.scrollIntoView({ behavior: 'auto', block: 'start' });
                        }
                      }}
                    >
                      {t(item.typeName as any)}
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

            <Box
              pl={[3, 0]}
              pr={[3, 5]}
              pt={1}
              flex={'1'}
              h={'100%'}
              overflow={'auto'}
              onScroll={handleScroll}
            >
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
                            <TemplateCard key={item.templateId} item={item} />
                          ))}
                        </Grid>
                      );
                    }

                    return <EmptyTip text={t('app:template_market_empty_data')} />;
                  })()}
                </>
              ) : (
                <>
                  {filterTemplateTags.map((item) => {
                    return (
                      <Box key={item.typeId}>
                        <Box
                          id={item.typeId}
                          fontSize={['md', 'lg']}
                          color={'myGray.900'}
                          mb={4}
                          fontWeight={500}
                        >
                          {t(item.typeName as any)}
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
                          {item.templates.map((item) => (
                            <TemplateCard key={item.templateId} item={item} />
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
