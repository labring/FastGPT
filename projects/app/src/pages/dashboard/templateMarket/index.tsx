import { serviceSideProps } from '@/web/common/i18n/utils';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import { Box, Button, Flex, Grid, HStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  type AppTemplateSchemaType,
  type TemplateTypeSchemaType
} from '@fastgpt/global/core/app/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemDetail } from '@/web/core/app/api/template';
import { postCreateApp } from '@/web/core/app/api';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AppTypeTag from '@/pageComponents/dashboard/apps/TypeTag';

import dynamic from 'next/dynamic';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
const UseGuideModal = dynamic(() => import('@/components/common/Modal/UseGuideModal'), {
  ssr: false
});

const TemplateMarket = ({
  templateList,
  templateTags,
  MenuIcon
}: {
  templateList: AppTemplateSchemaType[];
  templateTags: TemplateTypeSchemaType[];
  MenuIcon: JSX.Element;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    parentId,
    type,
    appType = 'all'
  } = router.query as { parentId?: ParentIdType; type?: string; appType?: AppTypeEnum | 'all' };
  const [searchKey, setSearchKey] = useState('');

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

      return postCreateApp({
        parentId,
        avatar: template.avatar,
        name: template.name,
        type: template.type as AppTypeEnum,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig
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
        router.push(`/app/detail?appId=${id}`);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
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
    [onUseTemplate, feConfigs.systemTitle]
  );

  // Scroll to the selected template type
  useEffect(() => {
    if (type) {
      const typeElement = document.getElementById(type as string);
      if (typeElement) {
        typeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [type]);

  return (
    <MyBox ref={containerRef} h={'100%'} isLoading={isCreating}>
      <Flex flexDirection={'column'} h={'100%'} py={5}>
        <Flex mb={4} alignItems={'center'} px={5}>
          {isPc ? (
            <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
              {t('app:template_market')}
            </Box>
          ) : (
            MenuIcon
          )}

          <Box flex={1} />
          <Box mr={3}>
            <SearchInput
              h={'34px'}
              bg={'white'}
              placeholder={t('app:templateMarket.Search_template')}
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </Box>
          <MySelect
            h={'34px'}
            bg={'white'}
            value={appType}
            list={[
              {
                value: 'all',
                label: t('app:type.All')
              },
              {
                value: AppTypeEnum.simple,
                label: t('app:type.Simple bot')
              },
              {
                value: AppTypeEnum.workflow,
                label: t('app:type.Workflow bot')
              },
              {
                value: AppTypeEnum.plugin,
                label: t('app:type.Plugin')
              }
            ]}
            onChange={(e) => {
              router.push({
                query: {
                  ...router.query,
                  type: '',
                  appType: e
                }
              });
            }}
          />
        </Flex>

        <Box flex={'1 0 0'} px={5} overflow={'auto'}>
          {searchKey ? (
            <>
              <Box fontSize={'lg'} color={'myGray.900'} mb={4}>
                {t('common:xx_search_result', { key: searchKey })}
              </Box>
              {(() => {
                const templates = templateList.filter((template) =>
                  `${template.name}${template.intro}`.includes(searchKey)
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
                    <Box id={item.typeId} color={'myGray.900'} mb={4} fontWeight={500} pt={2}>
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
      </Flex>
    </MyBox>
  );
};

const TemplateMarketContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <DashboardContainer>
      {({ templateTags, templateList, MenuIcon }) => (
        <TemplateMarket
          templateTags={templateTags}
          templateList={templateList}
          MenuIcon={MenuIcon}
        />
      )}
    </DashboardContainer>
  );
};

export default TemplateMarketContainer;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app']))
    }
  };
}
