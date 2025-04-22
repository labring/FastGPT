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

const CopyrightTable = () => {
  const { t } = useTranslation();
  const [teamName, setTeamName] = useState<string>('FastGPT');

  // 响应式尺寸
  const logoBoxSize = useBreakpointValue({ base: '50px', md: '60px' });
  const logoIconSize = useBreakpointValue({ base: '22px', md: '26px' });
  const logoIconHeight = useBreakpointValue({ base: '28px', md: '33px' });
  const logoBorderRadius = useBreakpointValue({ base: '10px', md: '15px' });
  const titleFontSize = useBreakpointValue({ base: '24px', md: '34px' });
  const dividerHeight = useBreakpointValue({ base: '70px', md: '84px' });

  // 示例数据
  const logos = [
    { id: 1, ratio: '4:1', url: '/path/to/logo1' },
    { id: 2, ratio: '1:1', url: '/path/to/logo2' }
  ];

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
              {/* 左侧 Logo 显示 */}
              <Flex direction="column" gap={2} alignItems="center">
                <Flex gap={{ base: 3, md: 5 }} alignItems="center">
                  <Box
                    width={logoBoxSize}
                    height={logoBoxSize}
                    bg="white"
                    border="1.25px solid #ECECEC"
                    borderRadius={logoBorderRadius}
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    position="relative"
                  >
                    <Box
                      width={logoIconSize}
                      height={logoIconHeight}
                      bgGradient="linear(to-b, #326DFF 0%, #8EAEFF 100%)"
                      position="absolute"
                      top="50%"
                      left="50%"
                      transform="translate(-50%, -50%)"
                      borderRadius="sm"
                    />
                  </Box>
                  <Text fontSize={titleFontSize} fontWeight={700} lineHeight="140%">
                    FastGPT
                  </Text>
                </Flex>
                <Text fontSize="12px" color="#667085" alignSelf="flex-start">
                  {t('建议比例 4:1')}
                </Text>
              </Flex>

              <Box display={{ base: 'none', md: 'block' }} w="1px" h={dividerHeight} bg="#F0F1F6" />

              {/* 右侧 Logo 显示 */}
              <Flex direction="column" gap={2} alignItems="center">
                <Box
                  width={logoBoxSize}
                  height={logoBoxSize}
                  bg="white"
                  border="0.833333px solid #ECECEC"
                  borderRadius={logoBorderRadius}
                  display="flex"
                  justifyContent="center"
                  alignItems="center"
                  position="relative"
                >
                  <Box
                    width={logoIconSize}
                    height={logoIconHeight}
                    bgGradient="linear(to-b, #326DFF 0%, #8EAEFF 100%)"
                    position="absolute"
                    top="50%"
                    left="50%"
                    transform="translate(-50%, -50%)"
                    borderRadius="sm"
                  />
                </Box>
                <Text fontSize="12px" color="#667085">
                  {t('建议比例 1:1')}
                </Text>
              </Flex>
            </Flex>

            <Flex w="100%">
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
