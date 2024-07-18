import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import * as React from 'react';
import { useCallback, useState } from 'react';
import * as ReactDOM from 'react-dom';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../../Icon';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import { EditorVariablePickerType } from '../../type.d';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

type EditorVariablePickerType1 = {
  key: string;
  label: string;
  required?: boolean;
  icon?: string;
  valueType?: WorkflowIOValueTypeEnum;
  index: number;
};
interface TransformedParent {
  id: string;
  label: string;
  avatar: string;
  children: EditorVariablePickerType1[];
}

export default function VariablePickerPlugin({
  variables
}: {
  variables: EditorVariablePickerType[];
}) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0
  });

  const onSelectOption = useCallback(
    (selectedOption: any, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selectedOption == null) {
          return;
        }
        if (nodeToRemove) {
          nodeToRemove.remove();
        }
        selection.insertNodes([
          $createTextNode(`{{$${selectedOption.parent?.id}.${selectedOption.key}$}}`)
        ]);
        closeMenu();
      });
    },
    [editor]
  );

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={variables as any[]}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (anchorElementRef.current == null) {
          return null;
        }
        return anchorElementRef.current && variables.length
          ? ReactDOM.createPortal(
              <Box
                bg={'white'}
                boxShadow={'lg'}
                borderWidth={'1px'}
                borderColor={'borderColor.base'}
                p={2}
                borderRadius={'md'}
                position={'absolute'}
                w={'auto'}
                overflow={'hidden'}
                zIndex={99999}
              >
                {transformData(variables).map((item, index) => {
                  return (
                    <Flex key={item.id}>
                      <Flex
                        flexDirection={'column'}
                        px={item.id && 4}
                        py={item.id && 2}
                        borderRadius={'sm'}
                      >
                        {item.id && (
                          <Flex alignItems={'center'}>
                            <Image src={item.avatar} w={'16px'} />
                            <Box mx={2} fontSize={'sm'} whiteSpace={'nowrap'}>
                              {item.label}
                            </Box>
                          </Flex>
                        )}
                        {item.children?.map((child, index) => (
                          <Flex
                            alignItems={'center'}
                            as={'li'}
                            key={child.key}
                            px={4}
                            py={2}
                            cursor={'pointer'}
                            maxH={'300px'}
                            overflow={'auto'}
                            _notLast={{
                              mb: 2
                            }}
                            {...(selectedIndex === child.index
                              ? {
                                  bg: 'primary.50',
                                  color: 'primary.600'
                                }
                              : {
                                  bg: 'white',
                                  color: 'myGray.600'
                                })}
                            onClick={() => {
                              setHighlightedIndex(child.index);
                              selectOptionAndCleanUp(child);
                            }}
                            onMouseEnter={() => {
                              setHighlightedIndex(child.index);
                            }}
                          >
                            <MyIcon
                              name={(child.icon as any) || 'core/modules/variable'}
                              w={'14px'}
                            />
                            <Box ml={2} fontSize={'sm'} whiteSpace={'nowrap'}>
                              {child.key}
                              {child.key !== child.label && `(${child.label})`}
                            </Box>
                          </Flex>
                        ))}
                      </Flex>
                    </Flex>
                  );
                })}
              </Box>,
              anchorElementRef.current
            )
          : null;
      }}
    />
  );
}

function transformData(data: EditorVariablePickerType[]): TransformedParent[] {
  const transformedData: TransformedParent[] = [];
  const parentMap: { [key: string]: TransformedParent } = {};

  data.forEach((item, index) => {
    const parentId = item.parent ? item.parent.id : '';
    const parentLabel = item.parent ? item.parent.label : '';
    const parentAvatar = item.parent ? item.parent.avatar : '';

    if (!parentMap[parentId]) {
      parentMap[parentId] = {
        id: parentId,
        label: parentLabel,
        avatar: parentAvatar || '',
        children: []
      };
    }
    parentMap[parentId].children.push({
      label: item.label,
      key: item.key,
      icon: item.icon,
      index
    });
  });

  for (const key in parentMap) {
    transformedData.push(parentMap[key]);
  }

  return transformedData;
}
