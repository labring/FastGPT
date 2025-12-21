import { Box, Flex, Spinner, Center } from '@chakra-ui/react';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToggle } from 'ahooks';
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo } from 'react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import { getWorkorderURL } from '@/web/common/workorder/api';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';

const BotShowRouter: { [key: string]: boolean } = {
  '/dashboard/agent': true,
  '/dashboard/tool': true,
  '/dashboard/systemTool': true,
  '/dashboard/templateMarket': true,
  '/dashboard/mcpServer': true,
  '/dashboard/evaluation': true,
  '/dataset/list': true,
  '/account/info': true
};

const HelperBot = () => {
  const router = useRouter();
  const { i18n } = useTranslation();
  const [open, setOpen] = useToggle(true);
  const [showChat, setShowChat] = useToggle(false);
  const [isLoading, setIsLoading] = useState(true);

  const { feConfigs, setNotSufficientModalType, subPlans } = useSystemStore();
  const { teamPlanStatus } = useUserStore();

  const hasTicketAccess = useMemo(() => {
    const plan = teamPlanStatus?.standard?.currentSubLevel
      ? subPlans?.standard?.[teamPlanStatus?.standard?.currentSubLevel]
      : undefined;
    const ticketResponseTime =
      teamPlanStatus?.standard?.ticketResponseTime ?? plan?.ticketResponseTime;
    return !!ticketResponseTime;
  }, [
    subPlans?.standard,
    teamPlanStatus?.standard?.currentSubLevel,
    teamPlanStatus?.standard?.ticketResponseTime
  ]);

  const botIframeUrl = feConfigs?.botIframeUrl;

  useEffect(() => {
    if (showChat) {
      setIsLoading(true);
    }
  }, [showChat]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'workorderRequest') {
        if (!hasTicketAccess) {
          setNotSufficientModalType(TeamErrEnum.ticketNotAvailable);
          return;
        }

        try {
          const data = await getWorkorderURL();
          if (data?.redirectUrl) {
            window.open(data.redirectUrl);
          }
        } catch (error) {
          console.error('Failed to create workorder:', error);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [hasTicketAccess, setNotSufficientModalType]);

  if (!botIframeUrl || !BotShowRouter[router.pathname]) {
    return null;
  }

  return (
    <>
      {showChat && open && (
        <Box
          position={'fixed'}
          right={3}
          bottom={'calc(10% + 80px)'}
          top={'50px'}
          w={'400px'}
          maxH={'790px'}
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
            src={`${botIframeUrl}&showWorkorder=1`}
            w={'100%'}
            h={'100%'}
            border={'none'}
            onLoad={() => setIsLoading(false)}
          />
        </Box>
      )}

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
                  <Box bgImage={getWebReqUrl('/imgs/botTextCN.svg')} w={'100%'} h={'100%'} />
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
    </>
  );
};

export default HelperBot;
