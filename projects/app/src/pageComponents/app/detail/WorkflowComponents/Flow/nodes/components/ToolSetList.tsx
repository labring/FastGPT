import React, { useCallback, useState } from 'react';
import { Box, Button, Flex, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

type ToolSetListItemType = {
  name: string;
  description?: string;
};

export const getNodeToolSetList = (tool: Pick<FlowNodeTemplateType, 'toolConfig'>) => {
  const mcpToolSet = tool.toolConfig?.mcpToolSet;
  const httpToolSet = tool.toolConfig?.httpToolSet;
  const toolList =
    (mcpToolSet && 'toolList' in mcpToolSet ? mcpToolSet.toolList : undefined) ??
    (httpToolSet && 'toolList' in httpToolSet ? httpToolSet.toolList : undefined) ??
    tool.toolConfig?.systemToolSet?.toolList;

  return toolList ?? [];
};

const ToolSetList = ({
  toolList,
  title,
  onSaveDescription
}: {
  toolList: ToolSetListItemType[];
  title?: React.ReactNode;
  onSaveDescription: (index: number, description: string) => void;
}) => {
  const { t } = useTranslation();
  const [editingItem, setEditingItem] = useState<{
    index: number;
    description: string;
  } | null>(null);

  const handleSave = useCallback(() => {
    if (!editingItem) return;
    onSaveDescription(editingItem.index, editingItem.description);
    setEditingItem(null);
  }, [editingItem, onSaveDescription]);
  const handleCancel = useCallback(() => {
    setEditingItem(null);
  }, []);

  return (
    <>
      {title}
      <Box maxH={'500px'} overflowY={'auto'} className="nowheel">
        {toolList.map((tool, index) => (
          <Flex
            key={`${tool.name}-${index}`}
            borderBottom={'1px solid'}
            borderColor={'myGray.200'}
            py={2}
            px={3}
          >
            <Box
              fontSize={'14px'}
              color={'myGray.500'}
              fontWeight={'medium'}
              style={{
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {index + 1 < 10 ? `0${index + 1}` : index + 1}
            </Box>
            <Box pl={2} position="relative" width={'full'}>
              <Box
                fontSize={'14px'}
                color={'myGray.900'}
                whiteSpace="nowrap"
                overflow="hidden"
                textOverflow="ellipsis"
              >
                {tool.name}
              </Box>
              <Flex gap={'4px'}>
                <MyTooltip
                  shouldWrapChildren={false}
                  hasArrow
                  label={
                    <Box
                      maxH={'300px'}
                      overflowY={'auto'}
                      whiteSpace={'pre-wrap'}
                      wordBreak={'break-word'}
                    >
                      {tool.description || t('app:tools_no_description')}
                    </Box>
                  }
                  maxW={'400px'}
                >
                  <Box width={'392px'} fontSize={'12px'} color={'myGray.500'} noOfLines={3}>
                    {tool.description || t('app:tools_no_description')}
                  </Box>
                </MyTooltip>
                <MyIconButton
                  size={'3'}
                  width={'20px'}
                  height={'20px'}
                  flex={0}
                  alignSelf={'center'}
                  icon={'edit'}
                  tip={t('common:Edit')}
                  onClick={() => {
                    setEditingItem({ index, description: tool.description ?? '' });
                  }}
                />
              </Flex>
            </Box>
          </Flex>
        ))}
      </Box>
      {editingItem && (
        <MyModal
          isOpen
          isCentered
          onClose={handleCancel}
          title={t('app:Edit_tool_description')}
          w={['90vw', '600px']}
          footer={
            <>
              <Button variant={'whiteBase'} onClick={handleCancel}>
                {t('common:Cancel')}
              </Button>
              <Button onClick={handleSave}>{t('common:Save')}</Button>
            </>
          }
        >
          <Textarea
            className="nodrag"
            autoFocus
            value={editingItem.description}
            placeholder={t('app:tools_no_description')}
            onChange={(event) =>
              setEditingItem((item) => (item ? { ...item, description: event.target.value } : item))
            }
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              handleCancel();
            }}
            minH={'160px'}
            resize={'vertical'}
            rows={6}
          />
        </MyModal>
      )}
    </>
  );
};

export default React.memo(ToolSetList);
