import {
  getTemplateMarketItemList,
  getTemplateMarketItemDetail
} from '@/web/core/app/api/template';
import {
  Box,
  Flex,
  Button,
  Collapse,
  Skeleton,
  SkeletonCircle,
  useBreakpointValue
} from '@chakra-ui/react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { postCreateApp } from '@/web/core/app/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useLocalStorageState } from 'ahooks';
import { useState } from 'react';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { appTypeTagMap } from '../constant';

const TemplateCreatePanel = ({ type }: { type: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();

  const randomNumber =
    useBreakpointValue({ base: 2, sm: 2, md: 3, lg: 3, xl: 4 }, { ssr: false }) || 3;

  const [isHoverMoreButton, setIsHoverMoreButton] = useState(false);
  const [isCollapsed, setIsCollapsed] = useLocalStorageState<boolean>(
    'template-create-panel-collapsed',
    {
      defaultValue: false
    }
  );

  const {
    runAsync: fetchTemplates,
    data: templateData,
    loading: isFetchingTemplates
  } = useRequest2(
    (ids?: string[]) => {
      const excludeIds = (() => {
        try {
          return JSON.stringify(ids);
        } catch (error) {
          return '';
        }
      })();
      return getTemplateMarketItemList({
        type,
        randomNumber,
        excludeIds
      });
    },
    {
      manual: false,
      refreshDeps: [type, randomNumber]
    }
  );

  const [creatingTemplateId, setCreatingTemplateId] = useState<string | null>(null);

  const { runAsync: handleCreateFromTemplate } = useRequest2(
    async (templateId: string) => {
      setCreatingTemplateId(templateId);
      const templateDetail = await getTemplateMarketItemDetail(templateId);

      if (templateDetail.type === AppTypeEnum.simple) {
        const completeWorkflow = form2AppWorkflow(templateDetail.workflow, t);
        templateDetail.workflow = completeWorkflow;
      }

      return postCreateApp({
        avatar: templateDetail.avatar,
        name: templateDetail.name,
        type: templateDetail.type as AppTypeEnum,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig || {},
        templateId: templateDetail.templateId
      }).then((res) => {
        webPushTrack.useAppTemplate({
          id: res,
          name: templateDetail.name
        });

        return res;
      });
    },
    {
      onSuccess: (appId: string) => {
        router.push(`/app/detail?appId=${appId}`);
      },
      onFinally: () => {
        setCreatingTemplateId(null);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  return (
    <Box
      borderBottom={'1px solid'}
      borderColor={'myGray.200'}
      pb={isCollapsed ? 2 : 5}
      mb={isCollapsed ? 3 : 5}
    >
      <Flex
        mb={isCollapsed ? 0 : 5}
        transition={'all 0.2s ease-in-out'}
        justifyContent={'space-between'}
        alignItems={'center'}
      >
        <Box
          color={'myGray.900'}
          fontSize={'20px'}
          fontWeight={'medium'}
          lineHeight="26px"
          letterSpacing="0.15px"
        >
          {t('app:create_from_template')}
        </Box>
        <Flex gap={4} alignItems={'center'}>
          {!isCollapsed && !!templateData?.total && templateData.total > 12 && (
            <Button
              size={'sm'}
              variant={'transparentBase'}
              color={'primary.600'}
              fontSize={'mini'}
              leftIcon={<MyIcon name={'common/refresh'} w={4} />}
              onClick={() => {
                const currentIds = templateData?.list.map((item) => item.templateId);
                fetchTemplates(currentIds);
              }}
            >
              {t('app:refresh_templates')}
            </Button>
          )}
          <Button
            variant={'transparentBase'}
            color={'myGray.500'}
            size={'sm'}
            fontSize={'mini'}
            leftIcon={
              <MyIcon name={isCollapsed ? 'core/chat/chevronDown' : 'core/chat/chevronUp'} w={4} />
            }
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? t('app:show_templates') : t('app:hide_templates')}
          </Button>
        </Flex>
      </Flex>

      <Collapse
        in={!isCollapsed}
        animateOpacity
        transition={{ enter: { duration: 0.2 }, exit: { duration: 0.2 } }}
        style={{ overflow: 'visible' }}
      >
        <Box
          display={'grid'}
          gridTemplateColumns={[
            'repeat(2, 1fr) 160px',
            'repeat(2, 1fr) 160px',
            'repeat(3, 1fr) 160px',
            'repeat(3, 1fr) 160px',
            'repeat(4, 1fr) 160px'
          ]}
          gap={5}
        >
          {isFetchingTemplates && !templateData?.list?.length
            ? Array.from({ length: randomNumber }).map((_, index) => (
                <Box
                  key={`skeleton-${index}`}
                  bg={'white'}
                  p={6}
                  borderRadius={'10px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                >
                  <Flex alignItems={'center'} gap={2} mb={2}>
                    <SkeletonCircle size={'40px'} />
                    <Flex flexDirection={'column'} gap={2} flex={1}>
                      <Skeleton height={4} />
                      <Skeleton height={4} />
                    </Flex>
                  </Flex>
                </Box>
              ))
            : templateData?.list.map((item, index) => {
                return (
                  <MyBox
                    key={index}
                    bg={'white'}
                    p={6}
                    borderRadius={'10px'}
                    border={'1px solid'}
                    borderColor={'myGray.200'}
                    boxShadow={'none'}
                    cursor={'pointer'}
                    position={'relative'}
                    overflow={'hidden'}
                    bgImage={item.isPromoted ? "url('/imgs/app/templateCreateBg.svg')" : 'none'}
                    bgSize={'105% auto'}
                    bgPosition={'top'}
                    bgRepeat={'no-repeat'}
                    _hover={{
                      boxShadow:
                        '0 1px 2px 0 rgba(19, 51, 107, 0.10), 0 0 1px 0 rgba(19, 51, 107, 0.15)',
                      '& .template-content': {
                        filter: 'blur(5px)'
                      },
                      '& .hover-text': {
                        opacity: 1
                      }
                    }}
                    isLoading={creatingTemplateId === item.templateId}
                    onClick={() => {
                      if (!creatingTemplateId) {
                        handleCreateFromTemplate(item.templateId);
                      }
                    }}
                    display={'flex'}
                    gap={2}
                    alignItems={'center'}
                  >
                    <Flex
                      className="template-content"
                      gap={2}
                      alignItems={'center'}
                      transition={'filter 0.1s ease-in-out'}
                      w={'full'}
                    >
                      <Avatar src={item.avatar} w={10} h={10} borderRadius={'4px'} />
                      <Box flex={1} minW={0} h={12}>
                        <Flex
                          fontSize={'16px'}
                          fontWeight={'medium'}
                          color={'myGray.900'}
                          alignItems={'center'}
                          gap={1}
                          justifyContent={'space-between'}
                        >
                          <Flex alignItems={'center'} gap={'7px'} flex={1} minW={0}>
                            <Box className="textEllipsis2" whiteSpace={'nowrap'}>
                              {item.name}
                            </Box>
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
                          <MyIcon
                            name={
                              appTypeTagMap[item.type as keyof typeof appTypeTagMap]?.icon as any
                            }
                            w={4}
                            color={'myGray.900'}
                            flexShrink={0}
                          />
                        </Flex>
                        <Box
                          fontSize={item.isPromoted ? '16px' : '14px'}
                          fontWeight={item.isPromoted ? 'medium' : 'normal'}
                          color={'myGray.500'}
                          noOfLines={1}
                          mt={0.5}
                        >
                          {(item.isPromoted ? item.recommendText || item.intro : item.intro) ||
                            t('app:templateMarket.no_intro')}
                        </Box>
                      </Box>
                    </Flex>
                    <Flex
                      className="hover-text"
                      position={'absolute'}
                      top={0}
                      left={0}
                      right={0}
                      bottom={0}
                      alignItems={'center'}
                      justifyContent={'center'}
                      opacity={0}
                      bg={' linear-gradient(180deg, rgba(255, 255, 255, 0.00) 0%, #FFF 100%)'}
                      transition={'opacity 0.1s ease-in-out'}
                      cursor={'pointer'}
                    >
                      <Flex
                        fontSize={'14px'}
                        fontWeight={'medium'}
                        color={'primary.700'}
                        rounded={'sm'}
                        px={5}
                        py={2.5}
                        _hover={{
                          bg: 'rgba(17, 24, 36, 0.05)'
                        }}
                      >
                        {t('app:templateMarket.Use')}
                      </Flex>
                    </Flex>
                  </MyBox>
                );
              })}
          <Box
            borderRadius={'10px'}
            overflow={'hidden'}
            cursor={'pointer'}
            position={'relative'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            _hover={{
              borderColor: 'primary.500',
              boxShadow: 'md'
            }}
            onClick={() => {
              router.push('/dashboard/templateMarket');
            }}
            p={0}
            onMouseEnter={() => setIsHoverMoreButton(true)}
            onMouseLeave={() => setIsHoverMoreButton(false)}
            minH={20}
            maxW={160}
          >
            <Box
              as="img"
              src={getWebReqUrl('/imgs/app/moreTemplateBg.svg')}
              w={'100%'}
              h={'100%'}
              position={'absolute'}
              transition="transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
              transform={isHoverMoreButton ? 'scale(1.2)' : 'scale(1.1)'}
            />
            <Box
              position={'relative'}
              left={3}
              top={3}
              fontSize={'16px'}
              color={'myGray.600'}
              fontWeight={'medium'}
              ml={1}
            >
              {t('common:More')}
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
};

export default TemplateCreatePanel;
