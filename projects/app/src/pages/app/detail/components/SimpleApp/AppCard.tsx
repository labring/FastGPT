import React, { useState } from 'react';
import {
  Box,
  Flex,
  Button,
  IconButton,
  HStack,
  ModalBody,
  Checkbox,
  ModalFooter
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { AppSchema, AppSimpleEditFormType } from '@fastgpt/global/core/app/type.d';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TagsEditModal from '../TagsEditModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AppContext } from '@/pages/app/detail/components/context';
import { useContextSelector } from 'use-context-selector';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postTransition2Workflow } from '@/web/core/app/api/app';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { SimpleAppSnapshotType } from './useSnapshots';

const AppCard = ({
  appForm,
  setPast
}: {
  appForm: AppSimpleEditFormType;
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);
  const onDelApp = useContextSelector(AppContext, (v) => v.onDelApp);

  const appId = appDetail._id;
  const { feConfigs } = useSystemStore();
  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchema>();

  // transition to workflow
  const [transitionCreateNew, setTransitionCreateNew] = useState<boolean>();
  const { runAsync: onTransition, loading: transiting } = useRequest2(
    async () => {
      const { nodes, edges } = form2AppWorkflow(appForm, t);
      await onSaveApp({
        nodes,
        edges,
        chatConfig: appForm.chatConfig,
        isPublish: false,
        versionName: t('app:transition_to_workflow')
      });

      return postTransition2Workflow({ appId, createNew: transitionCreateNew });
    },
    {
      onSuccess: ({ id }) => {
        if (id) {
          router.replace({
            query: {
              appId: id
            }
          });
        } else {
          setPast([]);
          router.reload();
        }
      },
      successToast: t('common:common.Success')
    }
  );

  return (
    <>
      {/* basic info */}
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
          <Button
            size={['sm', 'md']}
            variant={'whitePrimary'}
            leftIcon={<MyIcon name={'core/chat/chatLight'} w={'16px'} />}
            onClick={() => router.push(`/chat?appId=${appId}`)}
          >
            {t('common:core.Chat')}
          </Button>
          {appDetail.permission.hasManagePer && (
            <Button
              size={['sm', 'md']}
              variant={'whitePrimary'}
              leftIcon={<MyIcon name={'common/settingLight'} w={'16px'} />}
              onClick={onOpenInfoEdit}
            >
              {t('common:common.Setting')}
            </Button>
          )}
          {appDetail.permission.isOwner && (
            <MyMenu
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
                      icon: 'core/app/type/workflow',
                      label: t('app:transition_to_workflow'),
                      onClick: () => setTransitionCreateNew(true)
                    },
                    ...(appDetail.permission.hasWritePer && feConfigs?.show_team_chat
                      ? [
                          {
                            icon: 'core/chat/fileSelect',
                            label: t('common:common.Team Tags Set'),
                            onClick: () => setTeamTagsSet(appDetail)
                          }
                        ]
                      : [])
                  ]
                },
                {
                  children: [
                    {
                      icon: 'delete',
                      type: 'danger',
                      label: t('common:common.Delete'),
                      onClick: onDelApp
                    }
                  ]
                }
              ]}
            />
          )}
          <Box flex={1} />
          {/* {isPc && ( */}
          {/*   <MyTag */}
          {/*     type="borderFill" */}
          {/*     colorSchema="gray" */}
          {/*     onClick={() => (appDetail.permission.hasManagePer ? onOpenInfoEdit() : undefined)} */}
          {/*   > */}
          {/*     <PermissionIconText defaultPermission={appDetail.defaultPermission} /> */}
          {/*   </MyTag> */}
          {/* )} */}
        </HStack>
      </Box>
      {TeamTagsSet && <TagsEditModal onClose={() => setTeamTagsSet(undefined)} />}
      {transitionCreateNew !== undefined && (
        <MyModal isOpen title={t('app:transition_to_workflow')} iconSrc="core/app/type/workflow">
          <ModalBody>
            <Box mb={3}>{t('app:transition_to_workflow_create_new_tip')}</Box>
            <HStack cursor={'pointer'} onClick={() => setTransitionCreateNew((state) => !state)}>
              <Checkbox
                isChecked={transitionCreateNew}
                icon={<MyIcon name={'common/check'} w={'12px'} />}
              />
              <Box>{t('app:transition_to_workflow_create_new_placeholder')}</Box>
            </HStack>
          </ModalBody>
          <ModalFooter>
            <Button variant={'whiteBase'} onClick={() => setTransitionCreateNew(undefined)} mr={3}>
              {t('common:common.Close')}
            </Button>
            <Button variant={'dangerFill'} isLoading={transiting} onClick={() => onTransition()}>
              {t('common:common.Confirm')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(AppCard);
