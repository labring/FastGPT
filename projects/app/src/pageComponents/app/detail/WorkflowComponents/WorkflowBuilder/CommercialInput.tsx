import React from 'react';
import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getDocPath } from '@/web/common/system/doc';

const commercialFeatures = [
  'workflow_builder_commercial_feature_generation',
  'workflow_builder_commercial_feature_dataset_tenant',
  'workflow_builder_commercial_feature_audit',
  'workflow_builder_commercial_feature_third_party_dataset',
  'workflow_builder_commercial_feature_dashboard',
  'workflow_builder_commercial_feature_more'
] as const;

/** 按 Figma 展示社区版 Workflow Builder 的商业版锁定输入区。 */
const WorkflowBuilderCommercialInput = () => {
  const { t } = useTranslation('workflow');

  return (
    <Box w="100%" px="17.5px" pb="16px" flexShrink={0}>
      <Box
        position="relative"
        w="100%"
        minH="140px"
        overflow="hidden"
        borderRadius="20px"
        bg="white"
        boxShadow="0px 5px 16px -4px rgba(19, 51, 107, 0.08)"
        sx={{
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            pointerEvents: 'none',
            padding: '1px',
            borderRadius: 'inherit',
            background:
              'linear-gradient(112deg, #FF4BCB 0%, #FF9F43 27%, #E8EBF0 52%, #3370FF 78%, #42D7FF 100%)',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude'
          }
        }}
      >
        <Flex w="100%" p="16px" flexDirection="column" alignItems="flex-end" gap="8px">
          <Flex w="100%" flexDirection="column" alignItems="flex-start" gap="8px">
            <Flex h="20px" alignItems="center" gap="4px">
              <Box position="relative" boxSize="20px" flexShrink={0}>
                <MyIcon
                  name="core/chat/workflowBuilder/commercialStar"
                  position="absolute"
                  top="1.898px"
                  left="1.842px"
                  w="17.1413px"
                  h="16.2037px"
                  aria-hidden="true"
                  focusable={false}
                />
              </Box>
              <Text
                flexShrink={0}
                color="#111824"
                fontSize="14px"
                fontWeight={500}
                lineHeight="20px"
                letterSpacing="0.1px"
                whiteSpace="nowrap"
              >
                {t('workflow_builder_commercial_title')}
              </Text>
            </Flex>

            <Grid
              w="100%"
              gridTemplateColumns="repeat(3, minmax(0, 1fr))"
              columnGap="16px"
              rowGap="8px"
            >
              {commercialFeatures.map((feature, index) => {
                const isMore = index === commercialFeatures.length - 1;

                return (
                  <Flex
                    key={feature}
                    minW={0}
                    alignItems="center"
                    gap="4px"
                    justifySelf={index === 0 ? 'stretch' : 'start'}
                  >
                    <Flex
                      boxSize="16px"
                      flexShrink={0}
                      alignItems="center"
                      justifyContent="center"
                      borderRadius="999px"
                      bg="#F0F4FF"
                    >
                      <Box position="relative" boxSize="12px">
                        <MyIcon
                          name={
                            isMore
                              ? 'core/chat/workflowBuilder/commercialMore'
                              : 'core/chat/workflowBuilder/commercialCheck'
                          }
                          position="absolute"
                          top={isMore ? '1.5px' : '2.5px'}
                          left={isMore ? '5px' : '1.5px'}
                          w={isMore ? '2px' : '9px'}
                          h={isMore ? '9px' : '6.5px'}
                          transform={isMore ? 'rotate(-90deg)' : undefined}
                          aria-hidden="true"
                          focusable={false}
                        />
                      </Box>
                    </Flex>
                    <Text
                      minW={0}
                      flexShrink={0}
                      color="#485264"
                      fontSize="12px"
                      fontWeight={400}
                      lineHeight="16px"
                      letterSpacing="0.048px"
                      whiteSpace="nowrap"
                    >
                      {t(feature)}
                    </Text>
                  </Flex>
                );
              })}
            </Grid>
          </Flex>

          <Button
            variant="unstyled"
            display="flex"
            w="132px"
            minW="132px"
            h="32px"
            minH="32px"
            px="14px"
            py="8px"
            alignItems="center"
            justifyContent="center"
            color="white"
            bg="#3370FF"
            borderRadius="6px"
            boxShadow="0px 1px 2px rgba(19, 51, 107, 0.05), 0px 0px 1px rgba(19, 51, 107, 0.08)"
            fontSize="12px"
            fontWeight={500}
            lineHeight="16px"
            letterSpacing="0.5px"
            _hover={{ bg: '#3370FF' }}
            _active={{ bg: '#3370FF' }}
            onClick={() => window.open(getDocPath('/guide/version/commercial'), '_blank')}
          >
            {t('workflow_builder_commercial_unlock')}
          </Button>
        </Flex>
      </Box>
    </Box>
  );
};

export default React.memo(WorkflowBuilderCommercialInput);
