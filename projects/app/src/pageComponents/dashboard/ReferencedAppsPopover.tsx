import React, { useEffect, useState } from 'react';
import { Box, Flex, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import type { ReferencedAppsResponse } from '@fastgpt/global/core/app/type';

const RELATED_APPS_MAX_H = '240px';

const ReferencedAppsContent = ({
  resourceId,
  loadApps
}: {
  resourceId: string;
  loadApps: (resourceId: string) => Promise<ReferencedAppsResponse>;
}) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ReferencedAppsResponse>({ list: [], hiddenCount: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadApps(resourceId)
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [loadApps, resourceId]);

  const { list, hiddenCount } = data;

  return (
    <MyBox
      isLoading={isLoading}
      minH={isLoading ? '80px' : 'auto'}
      px={'12px'}
      py={'8px'}
      onClick={(e) => e.stopPropagation()}
    >
      <Box maxH={RELATED_APPS_MAX_H} overflowY={'auto'}>
        <Flex>
          <Flex flex={'1 0 0'} minW={0} direction={'column'}>
            {list.map((app) => (
              <Flex
                key={app._id}
                h={'48px'}
                align={'center'}
                gap={'8px'}
                px={'12px'}
                borderBottom={'sm'}
                _last={{ borderBottom: 'none' }}
                overflow={'hidden'}
              >
                <Avatar src={app.avatar} w={'20px'} h={'20px'} borderRadius={'sm'} flexShrink={0} />
                <Box
                  flex={'1 1 0'}
                  minW={0}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  color={'myGray.900'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.name}
                </Box>
              </Flex>
            ))}
          </Flex>
          <Flex w={'120px'} flexShrink={0} direction={'column'}>
            {list.map((app) => (
              <Flex
                key={app._id}
                h={'48px'}
                align={'center'}
                gap={'4px'}
                px={'12px'}
                borderBottom={'sm'}
                _last={{ borderBottom: 'none' }}
                overflow={'hidden'}
              >
                <MyIcon
                  name={'common/lineUser'}
                  w={'13px'}
                  h={'14px'}
                  color={'myGray.400'}
                  flexShrink={0}
                />
                <Box
                  flex={'1 1 0'}
                  minW={0}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  color={'myGray.500'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.sourceMember?.name || '-'}
                </Box>
              </Flex>
            ))}
          </Flex>
        </Flex>
      </Box>
      {hiddenCount > 0 && (
        <Box
          mt={'8px'}
          fontSize={'12px'}
          lineHeight={'16px'}
          color={'myGray.500'}
          letterSpacing={'0.4px'}
        >
          {t('common:related_apps_hidden', { count: hiddenCount })}
        </Box>
      )}
    </MyBox>
  );
};

export type ReferencedAppsPopoverProps = {
  count: number;
  resourceId: string;
  loadApps: (resourceId: string) => Promise<ReferencedAppsResponse>;
  trigger: 'click' | 'hover';
};

/**
 * Shared popover displaying referencing apps for dashboard resource cards.
 * Renders static text when count is 0 and interactive popover when count is positive.
 */
const ReferencedAppsPopover = ({
  count,
  resourceId,
  loadApps,
  trigger
}: ReferencedAppsPopoverProps) => {
  const { t } = useTranslation();

  if (count <= 0) {
    return (
      <HStack spacing={1} onClick={(e) => e.stopPropagation()}>
        <Box color={'myGray.500'}>{t('common:related_count')}</Box>
        <Box color={'myGray.500'} fontWeight={'medium'}>
          0
        </Box>
      </HStack>
    );
  }

  return (
    <MyPopover
      trigger={trigger}
      closeOnBlur={trigger === 'click'}
      placement={'bottom'}
      hasArrow
      w={'320px'}
      p={0}
      borderRadius={'6px'}
      boxShadow={'3.5'}
      border={'none'}
      Trigger={
        <HStack
          spacing={1}
          cursor={'pointer'}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <Box color={'myGray.500'}>{t('common:related_count')}</Box>
          <Box color={'myGray.500'} fontWeight={'medium'}>
            {count}
          </Box>
        </HStack>
      }
    >
      {() => <ReferencedAppsContent resourceId={resourceId} loadApps={loadApps} />}
    </MyPopover>
  );
};

export default ReferencedAppsPopover;
