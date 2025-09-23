import { Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react';
import React, { useState } from 'react';
import { AppContext } from '../context';
import { useContextSelector } from 'use-context-selector';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { type AppSchema } from '@fastgpt/global/core/app/type';
import TagsEditModal from '../TagsEditModal';

const AppCard = () => {
  const { t } = useTranslation();

  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);
  const onDelApp = useContextSelector(AppContext, (v) => v.onDelApp);

  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchema>();

  return (
    <>
      <Box px={[4, 6]} py={4} position={'relative'}>
        <Flex alignItems={'center'}>
          <Avatar src={appDetail.avatar} borderRadius={'md'} w={'28px'} />
          <Box ml={3} fontWeight={'bold'} fontSize={'md'} flex={'1 0 0'} color={'myGray.900'}>
            {appDetail.name}
          </Box>
        </Flex>
        <Box
          flex={1}
          mt={3}
          mb={4}
          className={'textEllipsis3'}
          wordBreak={'break-all'}
          color={'myGray.600'}
          fontSize={'xs'}
          minH={'46px'}
        >
          {appDetail.intro || t('common:core.app.tip.Add a intro to app')}
        </Box>
        <HStack alignItems={'center'}>
          {appDetail.permission.hasManagePer && (
            <Button
              size={['sm', 'md']}
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'common/settingLight'} w={'16px'} />}
              onClick={onOpenInfoEdit}
            >
              {t('common:Setting')}
            </Button>
          )}
          {appDetail.permission.isOwner && (
            <MyMenu
              size={'xs'}
              Button={
                <IconButton
                  variant={'whitePrimary'}
                  size={['smSquare', 'mdSquare']}
                  icon={<MyIcon name={'more'} w={'1rem'} />}
                  aria-label={''}
                />
              }
              menuList={[
                {
                  children: [
                    {
                      icon: 'delete',
                      type: 'danger',
                      label: t('common:Delete'),
                      onClick: onDelApp
                    }
                  ]
                }
              ]}
            />
          )}
          <Box flex={1} />
        </HStack>
      </Box>
      {TeamTagsSet && <TagsEditModal onClose={() => setTeamTagsSet(undefined)} />}
    </>
  );
};

export default React.memo(AppCard);
