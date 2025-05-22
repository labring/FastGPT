import React from 'react';
import { Box, Flex, Text, Input, useBreakpointValue, Image } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { putUpdateGateConfigCopyRightData } from '@fastgpt/global/support/user/team/gate/api';
import { updateTeamGateConfigCopyRight } from '@/web/support/user/team/gate/api';

type Props = {
  gateName: string;
  gateLogo: string;
  gateBanner: string;
  onNameChange?: (name: string) => void;
  onLogoChange?: (logo: string) => void;
  onBannerChange?: (banner: string) => void;
};

export const saveCopyRightConfig = async (data: putUpdateGateConfigCopyRightData) => {
  try {
    await updateTeamGateConfigCopyRight(data);
  } catch (e) {
    console.error('Error saving copyright config:', e);
  }
};

// 斜线背景样式
const stripedBackgroundStyle = {
  backgroundImage:
    'linear-gradient(135deg, #f0f0f0 25%, transparent 25%, transparent 50%, #f0f0f0 50%, #f0f0f0 75%, transparent 75%, transparent)',
  backgroundSize: '5px 5px',
  padding: '12px',
  borderRadius: '16px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
  border: '1px dashed #e0e0e0'
};

// 添加悬浮遮罩样式
const uploadOverlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  border: '1px dashed var(--Royal-Blue-200, #C5D7FF)',
  background: 'rgba(255, 255, 255, 0.5)',
  backdropFilter: 'blur(2px)',
  zIndex: 10,
  opacity: 0,
  transition: 'opacity 0.3s ease',
  _groupHover: {
    opacity: 1
  }
};

const CopyrightTable = ({
  gateName,
  gateLogo,
  gateBanner,
  onNameChange,
  onLogoChange,
  onBannerChange
}: Props) => {
  const { t } = useTranslation();

  // 使用useForm管理表单数据
  const { setValue, watch } = useForm({
    defaultValues: {
      name: gateName,
      logo: gateLogo,
      banner: gateBanner
    }
  });

  // 从表单中获取logo和banner值
  const logo = watch('logo');
  const banner = watch('banner');

  const handleGateNameChange = (name: string) => {
    setValue('name', name);
    onNameChange?.(name);
  };
  const handleGateLogoChange = (logo: string) => {
    setValue('logo', logo);
    onLogoChange?.(logo);
  };
  const handleGateBannerChange = (banner: string) => {
    setValue('banner', banner);
    onBannerChange?.(banner);
  };

  // 添加文件选择器 - 分别为左右两侧Logo创建选择器
  const {
    File: LogoFile,
    onOpen: onOpenLogoFile,
    onSelectImage: onSelectLogoImage
  } = useSelectFile({
    fileType: '.jpg,.png,.svg',
    multiple: false
  });

  const {
    File: BannerFile,
    onOpen: onOpenBannerFile,
    onSelectImage: onSelectBannerImage
  } = useSelectFile({
    fileType: '.jpg,.png,.svg',
    multiple: false
  });

  // 响应式尺寸 - 根据设计比例调整
  const logoBoxSize = useBreakpointValue({ md: '60px' });
  const logoBorderRadius = useBreakpointValue({ base: '5.8px', md: '15px' });
  const titleFontSize = useBreakpointValue({ base: '18px', md: '28px' });
  const dividerHeight = useBreakpointValue({ base: '70px', md: '84px' });

  // 左侧带文本的Logo稍大一些
  const logoBoxSizeWithText = useBreakpointValue({ base: '28px', md: '60px' });

  return (
    <Box flex={'1 0 0'} overflow={'hidden'} display="flex" justifyContent="center">
      <Box w="100%" maxW={{ base: '100%', md: '640px' }} py={{ base: 4, md: 6 }}>
        <Flex flexDirection={'column'} gap={{ base: 4, md: 6 }}>
          {/* 基础设置区域 */}
          <Flex flexDirection="column" gap={{ base: 3, md: 4 }}>
            <Flex alignItems="center" gap={3}>
              <Box w="4px" h="16px" bg="#3370FF" borderRadius="6px" />
              <Text fontSize={{ base: '14px', md: '16px' }} fontWeight={500}>
                {t('common:base_config')}
              </Text>
            </Flex>

            <Flex direction="column" gap={2}>
              <Text fontSize="14px" color="#485264" fontWeight={500}>
                {t('account_gate:gate_name')}
              </Text>
              <Input
                value={watch('name')}
                onChange={(e) => handleGateNameChange(e.target.value)}
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
              {/* 左侧 Banner 显示 - 带文字 */}
              <Flex direction="column" gap={2} alignItems="center">
                <Box
                  sx={stripedBackgroundStyle}
                  onClick={onOpenBannerFile}
                  cursor="pointer"
                  role="group"
                  position="relative"
                >
                  <Flex gap={{ base: 3, md: 5 }} alignItems="center">
                    {banner ? (
                      <Flex
                        width={logoBoxSizeWithText}
                        height={logoBoxSizeWithText}
                        justifyContent="center"
                        alignItems="center"
                        position="relative"
                        overflow="hidden"
                        borderRadius={logoBorderRadius}
                        boxSizing="border-box"
                        transition="all 0.3s ease"
                      >
                        <Image
                          src={banner}
                          alt="Team Logo"
                          width="100%"
                          height="100%"
                          objectFit="contain"
                        />
                      </Flex>
                    ) : (
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
                        boxSizing="border-box"
                        transition="all 0.3s ease"
                      >
                        <Flex
                          width="40px"
                          height="40px"
                          justifyContent="center"
                          alignItems="center"
                          flexShrink="0"
                          aspectRatio="1/1"
                        >
                          <Image
                            src={banner}
                            alt="Team Logo"
                            width="100%"
                            height="100%"
                            objectFit="contain"
                            fallbackSrc="/icon/logo.svg"
                          />
                        </Flex>
                      </Box>
                    )}
                    <Text fontSize={titleFontSize} fontWeight={700} lineHeight="140%">
                      {watch('name')}
                    </Text>
                  </Flex>

                  {/* 悬浮遮罩 - 4:1 */}
                  <Box
                    sx={{
                      ...uploadOverlayStyle,
                      width: '100%',
                      height: '100%'
                    }}
                    borderRadius="16px"
                  >
                    <Flex direction="column" alignItems="center" justifyContent="center">
                      <MyIcon
                        name="support/gate/home/upload"
                        width="24px"
                        height="24px"
                        color="blue.500"
                      />
                    </Flex>
                  </Box>
                </Box>
                <Text fontSize="12px" color="#667085" alignSelf="flex-start">
                  {t('account_gate:suggestion_ratio_4_1')}
                </Text>
              </Flex>

              <Box display={{ base: 'none', md: 'block' }} w="1px" h={dividerHeight} bg="#F0F1F6" />

              {/* 右侧 Logo 显示 - 仅Logo */}
              <Flex direction="column" gap={2} alignItems="center">
                <Box
                  sx={stripedBackgroundStyle}
                  onClick={onOpenLogoFile}
                  cursor="pointer"
                  role="group"
                  position="relative"
                >
                  {logo ? (
                    <Flex
                      width={logoBoxSize}
                      height={logoBoxSize}
                      justifyContent="center"
                      alignItems="center"
                      position="relative"
                      overflow="hidden"
                      borderRadius={logoBorderRadius}
                      boxSizing="border-box"
                      transition="all 0.3s ease"
                    >
                      <Image
                        src={logo}
                        alt="Team Logo"
                        width="100%"
                        height="100%"
                        objectFit="contain"
                      />
                    </Flex>
                  ) : (
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
                      transition="all 0.3s ease"
                    >
                      <Flex
                        width="40px"
                        height="40px"
                        justifyContent="center"
                        alignItems="center"
                        flexShrink="0"
                        aspectRatio="1/1"
                      >
                        <Image
                          src={logo}
                          alt="Team Logo"
                          width="100%"
                          height="100%"
                          objectFit="contain"
                          fallbackSrc="/icon/logo.svg"
                        />
                      </Flex>
                    </Box>
                  )}

                  {/* 悬浮遮罩 - 1:1 */}
                  <Box
                    sx={{
                      ...uploadOverlayStyle,
                      width: '100%',
                      height: '100%'
                    }}
                    borderRadius="16px"
                  >
                    <Flex direction="column" alignItems="center" justifyContent="center">
                      <MyIcon
                        name="support/gate/home/upload"
                        width="24px"
                        height="24px"
                        color="blue.500"
                      />
                    </Flex>
                  </Box>
                </Box>
                <Text fontSize="12px" color="#667085">
                  {t('account_gate:suggestion_ratio_1_1')}
                </Text>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Box>

      {/* 文件选择器组件 */}
      <LogoFile
        onSelect={(e: File[]) =>
          onSelectLogoImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e: string) => {
              setValue('logo', e);
              handleGateLogoChange(e);
            }
          })
        }
      />

      <BannerFile
        onSelect={(e: File[]) =>
          onSelectBannerImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e: string) => {
              setValue('banner', e);
              handleGateBannerChange(e);
            }
          })
        }
      />
    </Box>
  );
};

export default CopyrightTable;
