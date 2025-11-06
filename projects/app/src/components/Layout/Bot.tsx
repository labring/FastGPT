import { Box, Flex, Spinner, Center } from '@chakra-ui/react';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToggle } from 'ahooks';
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';
import { useTranslation } from 'next-i18next';

const BotShowRouter: { [key: string]: boolean } = {
  '/dashboard/agent': true,
  '/dataset/': true
};

const Bot = () => {
  const router = useRouter();
  const { i18n } = useTranslation();
  const [open, setOpen] = useToggle(true);
  const [showChat, setShowChat] = useToggle(false);
  const [isLoading, setIsLoading] = useState(true);

  const { feConfigs, subPlans } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  console.log(i18n.language);

  useEffect(() => {
    if (showChat) {
      setIsLoading(true);
    }
  }, [showChat]);

  const showBot = BotShowRouter[router.pathname];

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

  const showWorkorder = feConfigs?.show_workorder && isPlanUser;

  return (
    <>
      {showChat && open && (
        <Box
          position={'fixed'}
          right={3}
          bottom={'calc(10% + 80px)'}
          w={'400px'}
          h={'600px'}
          bg={'white'}
          borderRadius={'lg'}
          boxShadow={'0px 4px 20px rgba(0, 0, 0, 0.15)'}
          zIndex={99}
          overflow={'hidden'}
        >
          {isLoading && (
            <Center
              position={'absolute'}
              top={0}
              left={0}
              right={0}
              bottom={0}
              bg={'white'}
              zIndex={2}
            >
              <Flex direction={'column'} alignItems={'center'} gap={3}>
                <Spinner size={'lg'} color={'primary.500'} thickness="3px" speed="0.8s" />
              </Flex>
            </Center>
          )}
          {/* 关闭聊天窗口按钮 */}
          <Box
            position={'absolute'}
            right={2}
            top={2}
            p={1}
            rounded={'md'}
            zIndex={1}
            _hover={{
              cursor: 'pointer',
              bgColor: 'myGray.200'
            }}
            onClick={() => setShowChat.set(false)}
          >
            <MyIcon name="close" w={6} />
          </Box>
          {/* iframe */}
          <Box
            as="iframe"
            src={`http://localhost:3000/chat/share?shareId=lGm8acViGhnTLpmXmmIMX41c&showWorkorder=${showWorkorder ? '1' : '0'}`}
            w={'100%'}
            h={'100%'}
            border={'none'}
            onLoad={() => setIsLoading(false)}
          />
        </Box>
      )}

      {/* 机器人按钮 */}
      {showBot && (
        <Flex
          position={'fixed'}
          right={3}
          bottom={'10%'}
          zIndex={100}
          transform={open ? 'none' : 'translateX(32px)'}
          transition={'transform 0.2s ease-in-out'}
        >
          {open && (
            <>
              <Box
                zIndex={10}
                position={'absolute'}
                right={-2}
                top={-2}
                w={4}
                h={4}
                borderRadius={'full'}
                _hover={{
                  cursor: 'pointer',
                  bgColor: 'myGray.200'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen.set(false);
                  setShowChat.set(false);
                }}
              >
                <MyIcon name="close" />
              </Box>
              {!showChat && (
                <Box
                  position={'absolute'}
                  left={'-40px'}
                  top={'-30px'}
                  w={'80px'}
                  h={'80px'}
                  zIndex={-10}
                >
                  {i18n.language === 'zh-CN' ? (
                    <Box bgImage={getWebReqUrl('/imgs/botText.svg')} w={'100%'} h={'100%'} />
                  ) : (
                    <Box bgImage={getWebReqUrl('/imgs/botTextEn.svg')} w={'100%'} h={'100%'} />
                  )}
                </Box>
              )}
            </>
          )}

          <Box
            bgImage={getWebReqUrl(open ? '/imgs/bot.svg' : '/imgs/botClosed.svg')}
            w={'60px'}
            h={'60px'}
            rounded={'full'}
            boxShadow={'3px 25px 9.7px 0 rgba(62, 81, 177, 0.05)'}
            _hover={{
              cursor: 'pointer'
            }}
            onClick={() => {
              if (open) {
                setShowChat.toggle();
              } else {
                setOpen.set(true);
              }
            }}
          />
        </Flex>
      )}
    </>
  );
};

export default Bot;
