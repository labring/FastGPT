import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import React from 'react';
import type { updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { updateLogKeys } from '@/web/core/app/api/log';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import type { AppLogKeysType } from '@fastgpt/global/core/app/logs/type';

const SyncLogKeysPopover = ({
  logKeys,
  setLogKeys,
  teamLogKeys,
  fetchLogKeys
}: {
  logKeys: AppLogKeysType[];
  setLogKeys: (logKeys: AppLogKeysType[]) => void;
  teamLogKeys: AppLogKeysType[];
  fetchLogKeys: () => Promise<AppLogKeysType[]>;
}) => {
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appId);

  const { runAsync: updateList, loading: updateLoading } = useRequest2(
    async (data: updateLogKeysBody) => {
      await updateLogKeys(data);
    },
    {
      manual: true,
      onSuccess: async () => {
        await fetchLogKeys();
      }
    }
  );

  return (
    <MyPopover
      placement="bottom-end"
      w={'300px'}
      closeOnBlur={true}
      trigger="click"
      Trigger={
        <Flex alignItems={'center'} cursor={'pointer'}>
          <MyIcon name="common/warn" w={4} color={'yellow.500'} />
        </Flex>
      }
    >
      {({ onClose }) => {
        return (
          <Box p={4}>
            <Box mb={4}>{t('app:sync_log_keys_popover_text')}</Box>

            <Flex justifyContent={'end'} gap={2}>
              <Button
                variant={'outline'}
                size={'sm'}
                onClick={() => {
                  setLogKeys(teamLogKeys);
                  onClose();
                }}
              >
                {t('app:sync_team_app_log_keys')}
              </Button>
              <Button
                size={'sm'}
                isLoading={updateLoading}
                onClick={async () => {
                  await updateList({
                    appId: appId,
                    logKeys
                  });
                  onClose();
                }}
              >
                {t('app:save_team_app_log_keys')}
              </Button>
            </Flex>
          </Box>
        );
      }}
    </MyPopover>
  );
};

export default SyncLogKeysPopover;
