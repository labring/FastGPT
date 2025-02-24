import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getWorkorderURL } from '@/web/common/workorder/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Flex } from '@chakra-ui/react';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import Icon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useToggle } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

const WorkOrderShowRouter: { [key: string]: boolean } = {
  '/app/list': true,
  '/dataset/list': true,
  '/toolkit': true
};

function WorkorderButton() {
  const router = useRouter();
  const [open, setOpen] = useToggle(true);
  const { t } = useTranslation();

  const { feConfigs, subPlans } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  const { isPc } = useSystem();

  const { runAsync: onFeedback } = useRequest2(getWorkorderURL, {
    manual: true,
    onSuccess(data) {
      if (data) {
        window.open(data.redirectUrl);
      }
    }
  });

  const showWorkorder = WorkOrderShowRouter[router.pathname];

  const isPlanUser = useMemo(() => {
    if (!teamPlanStatus) return false;
    if (teamPlanStatus.standard?.currentSubLevel !== StandardSubLevelEnum.free) return true;
    if (teamPlanStatus.datasetMaxSize !== subPlans?.standard?.free?.maxDatasetSize) return true;
    if (teamPlanStatus.totalPoints !== subPlans?.standard?.free?.totalPoints) return true;
    return false;
  }, [
    subPlans?.standard?.free?.maxDatasetSize,
    subPlans?.standard?.free?.totalPoints,
    teamPlanStatus
  ]);

  return showWorkorder && feConfigs?.show_workorder && isPlanUser && isPc ? (
    <>
      {open ? (
        <Flex
          position="fixed"
          bottom="10%"
          right="0"
          height="56px"
          width="56px"
          zIndex={100}
          boxShadow="0px 12px 32px -4px #00175633"
          alignItems="center"
          justifyContent="center"
          direction="column"
          borderTopLeftRadius="8px"
          borderBottomLeftRadius="8px"
          border={'1px'}
          borderColor={'#DFE6F2'}
        >
          <Box
            zIndex={10}
            width="1rem"
            height="1rem"
            position="absolute"
            left="-6px"
            top="-6px"
            borderRadius="full"
            background="white"
            border="1px"
            borderColor={'myGray.100'}
            bgColor="myGray.25"
            _hover={{
              cursor: 'pointer',
              bgColor: 'myGray.100'
            }}
            onClick={() => setOpen.set(false)}
          >
            <Icon name="close" />
          </Box>
          <Flex
            alignItems="center"
            justifyContent="center"
            direction="column"
            bgColor="myGray.25"
            _hover={{
              cursor: 'pointer',
              bgColor: 'myGray.100'
            }}
            width="100%"
            height="100%"
            borderTopLeftRadius="8px"
            borderBottomLeftRadius="8px"
            onClick={onFeedback}
          >
            <Icon name="feedback" width="24px" height="24px" />
            <Box fontSize="xs" fontWeight="500">
              {t('common:question_feedback')}
            </Box>
          </Flex>
        </Flex>
      ) : (
        <Flex
          position="fixed"
          bottom="10%"
          right="0"
          height="44px"
          width="19px"
          bgColor="myGray.25"
          borderTopLeftRadius="8px"
          borderBottomLeftRadius="8px"
          border={'1px'}
          borderColor={'#DFE6F2'}
          zIndex={100}
          boxShadow="0px 12px 32px -4px #00175633"
          alignItems="center"
          justifyContent="center"
          direction="column"
          _hover={{
            cursor: 'pointer',
            bgColor: 'myGray.100'
          }}
          onClick={() => setOpen.set(true)}
        >
          <Icon name="core/chat/chevronLeft" width="16px" height="16px" />
        </Flex>
      )}
    </>
  ) : null;
}

export default WorkorderButton;
