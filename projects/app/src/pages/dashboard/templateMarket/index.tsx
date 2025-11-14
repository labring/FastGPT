'use client';
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
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import { form2AppWorkflow } from '@/web/core/app/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTemplateMarketItemDetail } from '@/web/core/app/api/template';
import { postCreateApp } from '@/web/core/app/api';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import Avatar from '@fastgpt/web/components/common/Avatar';

import dynamic from 'next/dynamic';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { appTypeTagMap } from '@/pageComponents/dashboard/constant';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
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
  const { isPc } = useSystem();
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    parentId,
    type,
    appType = 'all'
  } = router.query as { parentId?: ParentIdType; type?: string; appType?: AppTypeEnum | 'all' };
  const [searchKey, setSearchKey] = useState('');

  const tagsWithTemplates = useMemo(() => {
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

      if (template.type === AppTypeEnum.simple) {
        const completeWorkflow = form2AppWorkflow(templateDetail.workflow, t);
        templateDetail.workflow = completeWorkflow;
      }

      return postCreateApp({
        parentId,
        avatar: template.avatar,
        name: template.name,
        type: template.type as AppTypeEnum,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig,
        templateId: templateDetail.templateId
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
      const icon = appTypeTagMap[item.type as keyof typeof appTypeTagMap]?.icon;

      return (
        <MyBox
          key={item.templateId}
          w={'100%'}
          minWidth={0}
          py={3}
          px={6}
          border={'1px solid'}
          borderColor={'myGray.250'}
          borderRadius={'lg'}
          display={'flex'}
          flexDirection={'column'}
          gap={4}
          position={'relative'}
          overflow={'hidden'}
          bgImage={item.isPromoted ? "url('/imgs/app/templateBg.svg')" : 'none'}
          bgSize={'105% auto'}
          bgPosition={'top'}
          bgRepeat={'no-repeat'}
          _hover={{
            boxShadow: '0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)'
          }}
        >
          <HStack>
            <Avatar src={item.avatar} borderRadius={'4px'} w={10} h={10} />
            <Box flex={1} />
            <Flex w={10} h={10} justifyContent={'center'} alignItems={'center'}>
              <MyIcon name={icon as any} w={4} color={'myGray.900'} />
            </Flex>
          </HStack>
          <Box w={'100%'} minWidth={0}>
            <Flex
              color={'myGray.900'}
              fontWeight={'medium'}
              fontSize={'18px'}
              alignItems={'center'}
              gap={'7px'}
            >
              {item.name}
              {item.isPromoted && (
                <Box
                  p={'1px'}
                  bgGradient={'linear(201deg, #E6B3FF 13.74%, #006AFF 89.76%)'}
                  borderRadius={'full'}
                  flexShrink={0}
                >
                  <Box
                    px={1.5}
                    fontSize={'10px'}
                    bg={'myGray.25'}
                    borderRadius={'full'}
                    color={'myGray.900'}
                  >
                    {t('app:template.recommended')}
                  </Box>
                </Box>
              )}
            </Flex>
            <MyTooltip
              label={item.isPromoted ? item.recommendText || item.intro : item.intro}
              shouldWrapChildren={false}
              placement={'top'}
              hasArrow={false}
              offset={[0, 3]}
            >
              <Box
                w={'100%'}
                minWidth={0}
                color={'myGray.500'}
                fontSize={item.isPromoted ? '16px' : '14px'}
                fontWeight={item.isPromoted ? 'medium' : 'normal'}
                overflow={'hidden'}
                textOverflow={'ellipsis'}
                whiteSpace={'nowrap'}
              >
                {(item.isPromoted ? item.recommendText || item.intro : item.intro) ||
                  t('app:templateMarket.no_intro')}
              </Box>
            </MyTooltip>
          </Box>

          <Flex justifyContent={'space-between'} alignItems={'center'}>
            {(item.userGuide?.type === 'markdown' && item.userGuide?.content) ||
            (item.userGuide?.type === 'link' && item.userGuide?.link) ? (
              <UseGuideModal
                title={item.name}
                iconSrc={item.avatar}
                text={item.userGuide?.content}
                link={item.userGuide?.link}
              >
                {({ onClick }) => (
                  <Flex
                    cursor={'pointer'}
                    color={'myGray.500'}
                    gap={1}
                    fontSize={'14px'}
                    onClick={onClick}
                    _hover={{
                      color: 'primary.600'
                    }}
                  >
                    <MyIcon name="book" w={4} />
                    {t('app:templateMarket.template_guide')}
                  </Flex>
                )}
              </UseGuideModal>
            ) : (
              <Box></Box>
            )}
            <Button
              variant={'transparentBase'}
              px={5}
              py={2.5}
              rounded={'sm'}
              color={'primary.700'}
              onClick={() => onUseTemplate(item)}
            >
              {t('app:templateMarket.Use')}
            </Button>
          </Flex>
        </MyBox>
      );
    },
    [onUseTemplate]
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
      <Flex flexDirection={'column'} h={'100%'} py={6}>
        <Flex alignItems={'center'} px={6} mb={5}>
          {isPc ? (
            <Box fontSize={'lg'} color={'myGray.900'} fontWeight={'medium'}>
              {t('app:template_market')}
            </Box>
          ) : (
            MenuIcon
          )}
          <Box flex={1} />
          <Box mr={2}>
            <SearchInput
              h={9}
              w={240}
              bg={'white'}
              placeholder={t('app:templateMarket.Search_template')}
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
          </Box>
          <MySelect
            h={9}
            w={124}
            bg={'white'}
            value={appType}
            list={[
              {
                value: 'all',
                label: t('app:type.All')
              },
              {
                value: AppTypeEnum.workflow,
                label: t('app:type.Workflow bot')
              },
              {
                value: AppTypeEnum.simple,
                label: t('app:type.Chat_Agent')
              },
              {
                value: AppTypeEnum.workflowTool,
                label: t('app:toolType_workflow')
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

        <Box flex={'1 0 0'} px={6} overflow={'auto'}>
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
            <Flex flexDirection={'column'} gap={5}>
              {tagsWithTemplates.map((item) => {
                return (
                  <Box key={item.typeId}>
                    <Box
                      id={item.typeId}
                      color={'myGray.900'}
                      mb={4}
                      fontWeight={'medium'}
                      fontSize={'14px'}
                    >
                      {t(item.typeName as any)}
                    </Box>
                    <Grid
                      gridTemplateColumns={[
                        '1fr',
                        'repeat(2,1fr)',
                        'repeat(3,1fr)',
                        'repeat(3,1fr)',
                        'repeat(4,1fr)',
                        'repeat(5,1fr)'
                      ]}
                      gridGap={4}
                    >
                      {item.templates.map((item) => (
                        <TemplateCard key={item.templateId} item={item} />
                      ))}
                    </Grid>
                  </Box>
                );
              })}
            </Flex>
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
