import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import * as React from 'react';
import { useCallback, useState, useEffect, useRef } from 'react';
import * as ReactDOM from 'react-dom';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import { EditorVariableLabelPickerType } from '../../type';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../../Avatar';

interface EditorVariableItemType {
  key: string;
  label: string;
  required?: boolean;
  icon?: string;
  valueType?: WorkflowIOValueTypeEnum;
  index: number;
}
interface TransformedParent {
  id: string;
  label: string;
  avatar: string;
  children: EditorVariableItemType[];
}

export default function VariableLabelPickerPlugin({
  variables,
  isFocus
}: {
  variables: EditorVariableLabelPickerType[];
  isFocus: boolean;
}) {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const highlightedItemRef = useRef<any>(null);

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

  useEffect(() => {
    if (highlightedItemRef.current) {
      highlightedItemRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'end'
      });
    }
  }, [currentIndex]);

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={variableFilter(variables, queryString || '')}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp }) => {
        if (anchorElementRef.current == null) {
          return null;
        }
        if (currentIndex !== selectedIndex) {
          setCurrentIndex(selectedIndex || 0);
        }
        return anchorElementRef.current && variables.length && isFocus
          ? ReactDOM.createPortal(
              <Box
                bg={'white'}
                boxShadow={'lg'}
                border={'base'}
                p={1.5}
                borderRadius={'md'}
                position={'absolute'}
                w={'auto'}
                maxH={'300px'}
                minW={'240px'}
                overflow={'auto'}
                zIndex={99999}
              >
                {variableFilter(variables, queryString || '').length === variables.length && (
                  <Box fontSize={'xs'}>{t('workflow:variable_picker_tips')}</Box>
                )}
                {variableFilter(variables, queryString || '').length > 0 ? (
                  transformVariables(variableFilter(variables, queryString || '')).map((item) => {
                    return (
                      <Flex
                        key={item.id}
                        flexDirection={'column'}
                        pt={2}
                        _notLast={{
                          borderBottom: '1px solid',
                          borderColor: 'myGray.200'
                        }}
                      >
                        <Flex alignItems={'center'} mb={1.5}>
                          <Avatar
                            src={item.avatar as any}
                            w={'16px'}
                            borderRadius={'2.8px'}
                            display={'inline-flex'}
                            verticalAlign={'middle'}
                          />
                          <Box
                            mx={2}
                            fontSize={'sm'}
                            whiteSpace={'nowrap'}
                            color={'myGray.600'}
                            fontWeight={'semibold'}
                          >
                            {t(item.label as any)}
                          </Box>
                        </Flex>
                        {item.children?.map((child) => (
                          <Flex
                            alignItems={'center'}
                            as={'li'}
                            key={child.key}
                            px={2}
                            py={1}
                            rounded={'4px'}
                            cursor={'pointer'}
                            overflow={'auto'}
                            _notLast={{
                              mb: 1
                            }}
                            ref={selectedIndex === child.index ? highlightedItemRef : null}
                            {...(selectedIndex === child.index
                              ? {
                                  bg: '#1118240D',
                                  color: 'primary.700'
                                }
                              : {
                                  bg: 'white',
                                  color: 'myGray.600'
                                })}
                            _hover={{
                              bg: '#1118240D',
                              color: 'primary.700'
                            }}
                            onMouseDown={() => {
                              selectOptionAndCleanUp({ ...child, parent: item });
                            }}
                          >
                            <Box ml={2} fontSize={'sm'} whiteSpace={'nowrap'}>
                              {child.label}
                            </Box>
                          </Flex>
                        ))}
                      </Flex>
                    );
                  })
                ) : (
                  <Box p={2} color={'myGray.400'} fontSize={'sm'}>
                    {t('common:unusable_variable')}
                  </Box>
                )}
              </Box>,
              anchorElementRef.current
            )
          : null;
      }}
    />
  );
}

function transformVariables(variables: EditorVariableLabelPickerType[]): TransformedParent[] {
  const transformedData: TransformedParent[] = [];
  const parentMap: { [key: string]: TransformedParent } = {};

  variables.forEach((item, index) => {
    const parentId = item.parent.id;
    const parentLabel = item.parent.label;
    const parentAvatar = item.parent.avatar;

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

  const addedParents = new Set<string>();
  variables.forEach((item) => {
    const parentId = item.parent.id;
    if (!addedParents.has(parentId)) {
      transformedData.push(parentMap[parentId]);
      addedParents.add(parentId);
    }
  });

  return transformedData;
}

function variableFilter(
  variables: EditorVariableLabelPickerType[],
  queryString: string
): EditorVariableLabelPickerType[] {
  const lowerCaseQuery = queryString.toLowerCase();

  return variables.filter((item) => {
    const labelMatch = item.label.toLowerCase().includes(lowerCaseQuery);
    const keyMatch = item.key.toLowerCase().includes(lowerCaseQuery);
    const parentLabelMatch = item.parent.label.toLowerCase().includes(lowerCaseQuery);

    return labelMatch || keyMatch || parentLabelMatch;
  });
}
