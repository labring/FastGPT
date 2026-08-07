import React, { useState, type ReactNode } from 'react';
import { Accordion, Box, Flex, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyBox from '../../../../common/MyBox';
import LightRowTabs from '../../../../common/Tabs/LightRowTabs';
import { ParamSection, SubToolAccordionItem } from './components';
import ReadmeBox from './ReadmeBox';
import type { ToolDetailExtendedType } from './types';

type ToolDetailBodyProps = {
  parentTool?: Partial<ToolDetailExtendedType>;
  isToolSet: boolean;
  subTools: ToolDetailExtendedType[];
  readmeContent: string;
  actions?: ReactNode;
  showPoint?: boolean;
  systemTitle?: string;
};

/**
 * 渲染工具详情 Drawer 的共享正文，操作区由调用方注入以适配不同业务入口。
 */
const ToolDetailBody = ({
  parentTool,
  isToolSet,
  subTools,
  readmeContent,
  actions,
  showPoint = false,
  systemTitle
}: ToolDetailBodyProps) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('params');
  const author = [parentTool?.author, systemTitle].find((value) => value?.trim()) ?? 'FastGPT';
  const readmeSource = [readmeContent, parentTool?.userGuide].find((value) => value?.trim()) ?? '';

  return (
    <MyBox>
      <Flex gap={2} flexWrap="wrap">
        {parentTool?.tags?.map((tag) => (
          <Box
            key={tag}
            px={2}
            py={1}
            border={'1px solid'}
            borderRadius={'6px'}
            borderColor={'myGray.200'}
            fontSize={'10px'}
            fontWeight={'medium'}
            color={'myGray.700'}
          >
            {tag}
          </Box>
        ))}
      </Flex>
      <Box fontSize={'12px'} color="myGray.500" mt={3}>
        {parseI18nString(parentTool?.description ?? '', i18n.language)}
      </Box>
      <Box fontSize={'12px'} color="myGray.500" mt={3}>
        {`by ${author}`}
      </Box>

      {actions && <Box mt={3}>{actions}</Box>}

      {showPoint && (
        <Flex mt={4} gap={1.5} alignItems={'center'}>
          <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
            {t('app:toolkit_call_points_label')}
          </Box>
          <Box fontSize={'12px'} color={'myGray.600'}>
            {!!parentTool?.currentCost ? parentTool.currentCost : t('app:toolkit_no_call_points')}
          </Box>
        </Flex>
      )}

      <Flex mt={4} gap={1.5} alignItems={'center'}>
        <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
          {t('app:toolkit_activation_label')}
        </Box>
        <Box fontSize={'12px'} color={'myGray.600'}>
          {parentTool?.hasSystemSecret ||
          (parentTool?.secrets && parentTool.secrets.length > 0) ||
          (parentTool?.secretInputConfig && parentTool.secretInputConfig.length > 0) ||
          (parentTool?.inputList && parentTool.inputList.length > 0)
            ? t('app:toolkit_activation_required')
            : t('app:toolkit_activation_not_required')}
        </Box>
      </Flex>

      <Box mt={4}>
        <LightRowTabs
          list={[
            {
              label: isToolSet ? t('app:toolkit_tool_list') : t('app:toolkit_params_description'),
              value: 'params'
            },
            ...(parentTool?.courseUrl || parentTool?.readme || parentTool?.userGuide
              ? [{ label: t('app:toolkit_user_guide'), value: 'guide' }]
              : [])
          ]}
          value={activeTab}
          onChange={(value) => {
            if (
              value === 'guide' &&
              parentTool?.courseUrl &&
              !parentTool?.readme &&
              !parentTool?.userGuide
            ) {
              window.open(parentTool.courseUrl, '_blank');
            } else {
              setActiveTab(value as 'guide' | 'params');
            }
          }}
          gap={4}
        />
        <Box h={'1px'} w={'full'} bg={'myGray.200'} mt={'-5px'} mx={1} />
      </Box>

      <Box mt={4}>
        {activeTab === 'guide' && (
          <VStack align="stretch" spacing={4} flex="1" minH="0">
            {(parentTool?.readme || readmeContent || parentTool?.userGuide) && (
              <ReadmeBox source={readmeSource} courseUrl={parentTool?.courseUrl} />
            )}
          </VStack>
        )}

        {activeTab === 'params' && (
          <VStack align="stretch" spacing={4}>
            {isToolSet && subTools.length > 0 && (
              <Accordion allowMultiple {...(subTools.length === 1 ? { defaultIndex: [0] } : {})}>
                {subTools.map((subTool) => (
                  <SubToolAccordionItem key={subTool.pluginId} tool={subTool} />
                ))}
              </Accordion>
            )}

            {!isToolSet && (
              <>
                {parentTool?.versionList?.[0]?.inputs &&
                  parentTool.versionList[0].inputs.length > 0 && (
                    <ParamSection
                      title={t('app:toolkit_inputs')}
                      params={parentTool.versionList[0].inputs}
                    />
                  )}
                {parentTool?.versionList?.[0]?.outputs &&
                  parentTool.versionList[0].outputs.length > 0 && (
                    <ParamSection
                      title={t('app:toolkit_outputs')}
                      params={parentTool.versionList[0].outputs}
                    />
                  )}
              </>
            )}
          </VStack>
        )}
      </Box>
    </MyBox>
  );
};

export default ToolDetailBody;
