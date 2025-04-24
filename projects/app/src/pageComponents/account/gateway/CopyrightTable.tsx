import React from 'react';
import { Box, Flex, Text, Input, Button, useBreakpointValue, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';

type Props = {
  teamName: string;
};

const CopyrightTable = ({ teamName }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const { updateLocalCopyRightConfig } = useGateStore();
  const teamAvatar = userInfo?.team?.teamAvatar; // 使用团队头像，如果没有则使用默认logo

  const handleTeamNameChange = (name: string) => {
    updateLocalCopyRightConfig({ name });
  };

  // 响应式尺寸 - 根据设计比例调整
  const logoBoxSize = useBreakpointValue({ base: '23.18px', md: '50px' });
  const logoIconSize = useBreakpointValue({ base: '15.45px', md: '33px' });
  const logoBorderRadius = useBreakpointValue({ base: '5.8px', md: '12px' });
  const titleFontSize = useBreakpointValue({ base: '18px', md: '28px' });
  const dividerHeight = useBreakpointValue({ base: '70px', md: '84px' });

  // 左侧带文本的Logo稍大一些
  const logoBoxSizeWithText = useBreakpointValue({ base: '28px', md: '60px' });
  const logoIconSizeWithText = useBreakpointValue({ base: '18.5px', md: '40px' });

  return (
    <Box flex={'1 0 0'} overflow={'hidden'} display="flex" justifyContent="center">
      <Box w="100%" maxW={{ base: '100%', md: '640px' }} py={{ base: 4, md: 6 }}>
        <Flex flexDirection={'column'} gap={{ base: 4, md: 6 }}>
          {/* 基础设置区域 */}
          <Flex flexDirection="column" gap={{ base: 3, md: 4 }}>
            <Flex alignItems="center" gap={3}>
              <Box w="4px" h="16px" bg="#3370FF" borderRadius="6px" />
              <Text fontSize={{ base: '14px', md: '16px' }} fontWeight={500}>
                {t('common:common.base_config')}
              </Text>
            </Flex>

            <Flex direction="column" gap={2}>
              <Text fontSize="14px" color="#485264" fontWeight={500}>
                {t('account_gate:team_name')}
              </Text>
              <Input
                value={teamName}
                onChange={(e) => handleTeamNameChange(e.target.value)}
                bg="#FBFBFC"
                border="1px solid #E8EBF0"
                borderRadius="8px"
                height={{ base: '36px', md: '40px' }}
              />
            </Flex>
          </Flex>

          {/* Logo 设置区域 */}
          <Flex flexDirection="column" gap={{ base: 3, md: 4 }}>
            <Text fontSize="14px" color="#485264" fontWeight={500}>
              Logo预览
            </Text>

            <Flex
              gap={{ base: 4, md: 8 }}
              alignItems="center"
              justifyContent="flex-start"
              flexDirection={{ base: 'column', md: 'row' }}
            >
              {/* 左侧 Logo 显示 - 带文字 */}
              <Flex direction="column" gap={2} alignItems="center">
                <Flex gap={{ base: 3, md: 5 }} alignItems="center">
                  <Box
                    width={logoBoxSizeWithText}
                    height={logoBoxSizeWithText}
                    bg="white"
                    border="0.483px solid #ECECEC"
                    borderRadius={logoBorderRadius}
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    position="relative"
                    overflow="hidden"
                  >
                    <Image
                      src={teamAvatar}
                      alt="Team Logo"
                      width="100%"
                      height="100%"
                      objectFit="contain"
                      fallbackSrc="/icon/logo.svg"
                    />
                  </Box>
                  <Text fontSize={titleFontSize} fontWeight={700} lineHeight="140%">
                    {teamName}
                  </Text>
                </Flex>
                <Text fontSize="12px" color="#667085" alignSelf="flex-start">
                  {t('account_gate:suggestion_ratio_4_1')}
                </Text>
              </Flex>

              <Box display={{ base: 'none', md: 'block' }} w="1px" h={dividerHeight} bg="#F0F1F6" />

              {/* 右侧 Logo 显示 - 仅Logo */}
              <Flex direction="column" gap={2} alignItems="center">
                <Box
                  width={logoBoxSize}
                  height={logoBoxSize}
                  bg="white"
                  border="0.483px solid #ECECEC"
                  borderRadius={logoBorderRadius}
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  position="relative"
                  overflow="hidden"
                  boxSizing="border-box"
                >
                  <Image
                    src={teamAvatar}
                    alt="Team Logo"
                    width="100%"
                    height="100%"
                    objectFit="contain"
                    fallbackSrc="/icon/logo.svg"
                  />
                </Box>
                <Text fontSize="12px" color="#667085">
                  {t('account_gate:suggestion_ratio_1_1')}
                </Text>
              </Flex>
            </Flex>

            <Flex w="100%" mt={2}>
              <Button
                leftIcon={<SmallAddIcon />}
                variant="outline"
                size="sm"
                width="fit-content"
                minW="81px"
                height={{ base: '32px', md: '36px' }}
                border="1px solid #DFE2EA"
                borderRadius="6px"
                bg="white"
                color="#485264"
                _hover={{ bg: '#f6f8fb' }}
                px={3}
              >
                {t('account_gate:upload')}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
};

export default CopyrightTable;
