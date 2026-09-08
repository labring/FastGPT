import React, { useCallback, useRef, useState } from 'react';
import { Box, Flex, Textarea } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

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
  const [editingIndex, setEditingIndex] = useState<number>();
  const [editingDescription, setEditingDescription] = useState('');
  const isCancellingRef = useRef(false);

  const handleSave = useCallback(() => {
    if (editingIndex === undefined) return;
    if (isCancellingRef.current) {
      isCancellingRef.current = false;
      return;
    }

    onSaveDescription(editingIndex, editingDescription);
    setEditingIndex(undefined);
  }, [editingDescription, editingIndex, onSaveDescription]);
  const handleCancel = useCallback(() => {
    isCancellingRef.current = true;
    setEditingIndex(undefined);
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
                {editingIndex === index ? (
                  <Textarea
                    width="full"
                    autoFocus
                    value={editingDescription}
                    onChange={(event) => setEditingDescription(event.target.value)}
                    onBlur={handleSave}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape') return;
                      event.preventDefault();
                      handleCancel();
                    }}
                    minH={'28px'}
                    py={1}
                    px={2}
                    mt={0.5}
                    fontSize={'12px'}
                    lineHeight={'short'}
                    resize={'vertical'}
                    rows={6}
                  />
                ) : (
                  <Box width="392px" fontSize={'12px'} color={'myGray.500'} overflow="hidden">
                    {tool.description || t('app:tools_no_description')}
                  </Box>
                )}
                {editingIndex !== index && (
                  <>
                    <Box flex={1} />
                    <MyIconButton
                      size={'3'}
                      width={'20px'}
                      height={'20px'}
                      flex={0}
                      alignSelf={'center'}
                      icon={'edit'}
                      tip={t('common:Edit')}
                      onClick={() => {
                        isCancellingRef.current = false;
                        setEditingDescription(tool.description ?? '');
                        setEditingIndex(index);
                      }}
                    />
                  </>
                )}
              </Flex>
            </Box>
          </Flex>
        ))}
      </Box>
    </>
  );
};

export default React.memo(ToolSetList);
