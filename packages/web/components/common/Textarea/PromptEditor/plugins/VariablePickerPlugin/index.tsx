import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import * as React from 'react';
import { useCallback, useState } from 'react';
import * as ReactDOM from 'react-dom';
import MyIcon from '../../../../Icon';
import { Box, Flex, Image } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import { EditorVariablePickerType } from '../../type.d';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { DEFAULT_PARENT_ID } from '@fastgpt/global/common/string/constant';
import { IconNameType } from 'components/common/Icon/type';

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
      options={variables.map((item) =>
        item.parent
          ? item
          : { ...item, parent: { id: DEFAULT_PARENT_ID, label: DEFAULT_PARENT_ID, avatar: '' } }
      )}
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
                maxH={'300px'}
                minW={'240px'}
                overflow={'auto'}
                zIndex={99999}
              >
                {variableFilter(variables, queryString || '').length === variables.length && (
                  <Box fontSize={'xs'} ml={4}>
                    {'tips: 可输入变量名进行搜索'}
                  </Box>
                )}
                {variableFilter(variables, queryString || '').length > 0 ? (
                  transformData(variableFilter(variables, queryString || '')).map((item) => {
                    const isDefault = item?.id === DEFAULT_PARENT_ID;
                    return (
                      <Flex
                        key={item.id}
                        flexDirection={'column'}
                        px={!isDefault ? 4 : 0}
                        py={!isDefault ? 2 : 0}
                        _notLast={{
                          borderBottom: '1px solid',
                          borderColor: 'myGray.200'
                        }}
                      >
                        {!isDefault && (
                          <Flex alignItems={'center'} mb={1.5}>
                            <MyIcon name={item.avatar as IconNameType} w={'16px'} rounded={'xs'} />
                            <Box
                              mx={2}
                              fontSize={'sm'}
                              whiteSpace={'nowrap'}
                              color={'myGray.600'}
                              fontWeight={'semibold'}
                            >
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
                            py={1.5}
                            rounded={'md'}
                            cursor={'pointer'}
                            overflow={'auto'}
                            _notLast={{
                              mb: 1
                            }}
                            {...(selectedIndex === child.index
                              ? {
                                  bg: '#1118240D',
                                  color: 'primary.700'
                                }
                              : {
                                  bg: 'white',
                                  color: 'myGray.600'
                                })}
                            onClick={() => {
                              setHighlightedIndex(child.index);
                              selectOptionAndCleanUp({ ...child, parent: item });
                            }}
                            onMouseEnter={() => {
                              setHighlightedIndex(child.index);
                            }}
                          >
                            {isDefault && (
                              <MyIcon
                                name={(child.icon as any) || 'core/modules/variable'}
                                w={'14px'}
                              />
                            )}
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
                    {'无可用变量'}
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

function transformData(data: EditorVariablePickerType[]): TransformedParent[] {
  const transformedData: TransformedParent[] = [];
  const parentMap: { [key: string]: TransformedParent } = {};

  data.forEach((item, index) => {
    const itemWithParent = item.parent
      ? item
      : { ...item, parent: { id: DEFAULT_PARENT_ID, label: DEFAULT_PARENT_ID, avatar: '' } };
    const parentId = itemWithParent.parent!.id;
    const parentLabel = itemWithParent.parent!.label;
    const parentAvatar = itemWithParent.parent!.avatar;

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
  data.forEach((item) => {
    const parentId = item.parent ? item.parent.id : DEFAULT_PARENT_ID;
    if (!addedParents.has(parentId)) {
      transformedData.push(parentMap[parentId]);
      addedParents.add(parentId);
    }
  });
  return transformedData;
}

function variableFilter(
  data: EditorVariablePickerType[],
  queryString: string
): EditorVariablePickerType[] {
  const lowerCaseQuery = queryString.toLowerCase();

  return data.filter((item) => {
    const itemWithParent = item.parent
      ? item
      : { ...item, parent: { id: DEFAULT_PARENT_ID, label: DEFAULT_PARENT_ID, avatar: '' } };
    const labelMatch = itemWithParent.label.toLowerCase().includes(lowerCaseQuery);
    const keyMatch = itemWithParent.key.toLowerCase().includes(lowerCaseQuery);
    const parentLabelMatch = itemWithParent.parent!.label.toLowerCase().includes(lowerCaseQuery);

    return labelMatch || keyMatch || parentLabelMatch;
  });
}
