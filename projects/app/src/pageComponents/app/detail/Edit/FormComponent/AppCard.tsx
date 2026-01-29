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
import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import TagsEditModal from '../../TagsEditModal';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useContextSelector } from 'use-context-selector';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { postTransition2Workflow } from '@/web/core/app/api/app';
import type { SimpleAppSnapshotType } from './useSnapshots';
import ExportConfigPopover from '@/pageComponents/app/detail/ExportConfigPopover';
import { ChatSidebarPaneEnum } from '@/pageComponents/chat/constants';
import type { Form2WorkflowFnType } from './type';

const AppCard = ({
  appForm,
  setPast,
  form2WorkflowFn,
  configToWorkflow = true
}: {
  appForm: AppFormEditFormType;
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
  form2WorkflowFn: Form2WorkflowFnType;
  configToWorkflow?: boolean;
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const onOpenInfoEdit = useContextSelector(AppContext, (v) => v.onOpenInfoEdit);
  const onDelApp = useContextSelector(AppContext, (v) => v.onDelApp);

  const appId = appDetail._id;
  const { feConfigs } = useSystemStore();
  const [TeamTagsSet, setTeamTagsSet] = useState<AppSchemaType>();

  // transition to workflow
  const [transitionCreateNew, setTransitionCreateNew] = useState<boolean>();
  const { runAsync: onTransition, loading: transiting } = useRequest2(
    async () => {
      const { nodes, edges } = form2WorkflowFn(appForm, t);
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
      successToast: t('common:Success')
    }
  );

  return (
    <>
      {/* basic info */}
      <Box px={[4, 6]} py={5} position={'relative'}>
        {/* Header: Avatar, Name and Action Icons */}
        <Flex alignItems={'center'} justifyContent={'space-between'} mb={5}>
          <Flex alignItems={'center'} flex={1} minW={0}>
            <Avatar src={appDetail.avatar} borderRadius={'md'} w={'28px'} h={'28px'} />
            <Box
              ml={3}
              fontWeight={'bold'}
              fontSize={'lg'}
              color={'myGray.900'}
              flex={1}
              noOfLines={1}
            >
              {appDetail.name}
            </Box>
          </Flex>

          {/* Right Action Icons */}
          <HStack spacing={2} ml={4}>
            <IconButton
              variant={'whitePrimary'}
              size={'mdSquare'}
              icon={<MyIcon name={'core/chat/chatLight'} w={'18px'} />}
              aria-label={'chat'}
              onClick={() =>
                window.open(
                  `/chat?appId=${appId}&pane=${ChatSidebarPaneEnum.RECENTLY_USED_APPS}`,
                  '_blank'
                )
              }
            />
            {appDetail.permission.hasManagePer && (
              <IconButton
                variant={'whitePrimary'}
                size={'mdSquare'}
                icon={<MyIcon name={'common/settingLight'} w={'18px'} />}
                aria-label={'settings'}
                onClick={onOpenInfoEdit}
              />
            )}
            {appDetail.permission.isOwner && (
              <>
                {configToWorkflow ? (
                  <MyMenu
                    size={'xs'}
                    Button={
                      <IconButton
                        variant={'whitePrimary'}
                        size={'mdSquare'}
                        icon={<MyIcon name={'more'} w={'18px'} />}
                        aria-label={'more'}
                      />
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: (
                              <Flex>
                                <ExportConfigPopover
                                  appName={appDetail.name}
                                  appForm={appForm}
                                  chatConfig={appDetail.chatConfig}
                                />
                              </Flex>
                            )
                          },
                          {
                            icon: 'core/app/type/workflow',
                            label: t('app:transition_to_workflow'),
                            onClick: () => setTransitionCreateNew(true)
                          },
                          ...(appDetail.permission.hasWritePer && feConfigs?.show_team_chat
                            ? [
                                {
                                  icon: 'core/chat/fileSelect',
                                  label: t('app:team_tags_set'),
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
                            label: t('common:Delete'),
                            onClick: onDelApp
                          }
                        ]
                      }
                    ]}
                  />
                ) : (
                  <>
                    <IconButton
                      variant={'whiteDanger'}
                      size={'mdSquare'}
                      icon={<MyIcon name={'delete'} w={'18px'} />}
                      aria-label={'settings'}
                      onClick={onDelApp}
                    />
                  </>
                )}
              </>
            )}
          </HStack>
        </Flex>

        {/* Intro Text */}
        <Box
          className={'textEllipsis2'}
          wordBreak={'break-all'}
          color={'myGray.600'}
          fontSize={'sm'}
          lineHeight={'1.6'}
          height={'40px'}
        >
          {appDetail.intro || t('common:core.app.tip.Add a intro to app')}
        </Box>
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
              {t('common:Close')}
            </Button>
            <Button variant={'dangerFill'} isLoading={transiting} onClick={() => onTransition()}>
              {t('common:Confirm')}
            </Button>
          </ModalFooter>
        </MyModal>
      )}
    </>
  );
};

export default React.memo(AppCard);
