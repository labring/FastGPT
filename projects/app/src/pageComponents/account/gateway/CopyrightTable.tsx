import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Input,
  Button,
  Icon,
  useBreakpointValue
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';

// FastGPT Logo SVG组件
const FastGPTLogo = (props: any) => (
  <svg
    width={props.width || '15.45px'}
    height={props.height || '15.45px'}
    viewBox="0 0 49 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M20.3692 7.00001L28.9536 7V7.00294C29.0284 7.00099 29.1033 7.00002 29.1782 7.00002C30.3387 7.00002 31.4878 7.2344 32.5599 7.68979C33.6321 8.14518 34.6062 8.81265 35.4268 9.6541C36.2474 10.4956 36.8983 11.4945 37.3424 12.5939C37.7865 13.6933 38.0151 14.8716 38.0151 16.0616L20.3691 16.0616L20.3691 41C19.2418 41 18.1255 40.7655 17.084 40.3097C16.0425 39.854 15.0961 39.1861 14.299 38.344C13.5018 37.502 12.8695 36.5024 12.4381 35.4022C12.0566 34.4292 11.8388 33.3945 11.7935 32.3446H11.7846L11.7846 16.2792H11.7871C11.772 15.6165 11.8258 14.9506 11.9496 14.2938C12.2808 12.536 13.0984 10.9214 14.299 9.6541C15.4995 8.38681 17.0291 7.52377 18.6944 7.17413C19.2486 7.05776 19.8095 7 20.3692 7.00001Z"
      fill="url(#paint0_linear_1008_3495)"
    />
    <path
      d="M27.7569 29.8173H24.7138V21.5343H27.8019V21.5345C28.8803 21.5403 29.9474 21.7544 30.944 22.1651C31.9544 22.5815 32.8725 23.1919 33.6458 23.9613C34.4191 24.7308 35.0326 25.6442 35.4511 26.6496C35.8696 27.6549 36.085 28.7324 36.085 29.8205H27.7569V29.8173Z"
      fill="url(#paint1_linear_1008_3495)"
    />
    <defs>
      <linearGradient
        id="paint0_linear_1008_3495"
        x1="24.8999"
        y1="7"
        x2="24.8999"
        y2="41"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#326DFF" />
        <stop offset="1" stopColor="#8EAEFF" />
      </linearGradient>
      <linearGradient
        id="paint1_linear_1008_3495"
        x1="30.3994"
        y1="21.5343"
        x2="30.3994"
        y2="29.8205"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#326DFF" />
        <stop offset="1" stopColor="#8EAEFF" />
      </linearGradient>
    </defs>
  </svg>
);

const CopyrightTable = () => {
  const { t } = useTranslation();
  const [teamName, setTeamName] = useState<string>('FastGPT');

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
                {t('基础配置')}
              </Text>
            </Flex>

            <Flex direction="column" gap={2}>
              <Text fontSize="14px" color="#485264" fontWeight={500}>
                {t('团队名')}
              </Text>
              <Input
                placeholder={t('输入团队名称')}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
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
              {t('Logo')}
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
                  >
                    <FastGPTLogo
                      width={logoIconSizeWithText}
                      height={logoIconSizeWithText}
                      position="absolute"
                      top="50%"
                      left="50%"
                      transform="translate(-50%, -50%)"
                    />
                  </Box>
                  <Text fontSize={titleFontSize} fontWeight={700} lineHeight="140%">
                    {teamName}
                  </Text>
                </Flex>
                <Text fontSize="12px" color="#667085" alignSelf="flex-start">
                  {t('建议比例 4:1')}
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
                  boxSizing="border-box"
                >
                  <FastGPTLogo
                    width={logoIconSize}
                    height={logoIconSize}
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                  />
                </Box>
                <Text fontSize="12px" color="#667085">
                  {t('建议比例 1:1')}
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
                {t('上传')}
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Box>
    </Box>
  );
};

export default CopyrightTable;
