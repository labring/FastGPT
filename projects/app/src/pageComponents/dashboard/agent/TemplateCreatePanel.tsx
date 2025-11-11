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
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
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

const TemplateCreatePanel = ({ type }: { type: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();

  const randomNumber =
    useBreakpointValue({ base: 3, sm: 3, md: 4, lg: 4, xl: 5 }, { ssr: false }) || 4;

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
    (excludeIds?: string[]) =>
      getTemplateMarketItemList({
        type,
        randomNumber,
        excludeIds
      }),
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

      return postCreateApp({
        avatar: templateDetail.avatar,
        name: templateDetail.name,
        type: templateDetail.type as AppTypeEnum,
        modules: templateDetail.workflow.nodes || [],
        edges: templateDetail.workflow.edges || [],
        chatConfig: templateDetail.workflow.chatConfig || {},
        templateId: templateDetail.templateId
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
      >
        <Box
          display={'grid'}
          gridTemplateColumns={[
            'repeat(3, 1fr) 160px',
            'repeat(3, 1fr) 160px',
            'repeat(4, 1fr) 160px',
            'repeat(4, 1fr) 160px',
            'repeat(5, 1fr) 160px'
          ]}
          gap={4}
        >
          {isFetchingTemplates && !templateData?.list?.length
            ? Array.from({ length: randomNumber }).map((_, index) => (
                <Box
                  key={`skeleton-${index}`}
                  bg={'white'}
                  p={'19px'}
                  borderRadius={'10px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                >
                  <Flex alignItems={'center'} gap={2} mb={2}>
                    <SkeletonCircle size={'24px'} />
                    <Skeleton height={'16px'} flex={1} />
                  </Flex>
                  <Skeleton height={'12px'} />
                </Box>
              ))
            : templateData?.list.map((item, index) => (
                <MyBox
                  key={index}
                  bg={'white'}
                  p={4}
                  borderRadius={'10px'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  cursor={'pointer'}
                  _hover={{
                    borderColor: 'primary.500',
                    boxShadow: 'md'
                  }}
                  isLoading={creatingTemplateId === item.templateId}
                  onClick={() => {
                    if (!creatingTemplateId) {
                      handleCreateFromTemplate(item.templateId);
                    }
                  }}
                >
                  <Flex alignItems={'center'} gap={2} mb={2}>
                    <Avatar src={item.avatar} w={'24px'} h={'24px'} borderRadius={'4px'} />
                    <Box fontSize={'16px'} fontWeight={'medium'} color={'myGray.900'} noOfLines={1}>
                      {item.name}
                    </Box>
                  </Flex>
                  <Box fontSize={'12px'} color={'myGray.500'} noOfLines={1}>
                    {item.intro || ''}
                  </Box>
                </MyBox>
              ))}
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
