import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import * as React from 'react';
import { useCallback, useState } from 'react';
import * as ReactDOM from 'react-dom';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../../Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';
import { EditorVariablePickerType } from '../../type.d';

export default function VariablePickerPlugin({
  variables
}: {
  variables: EditorVariablePickerType[];
}) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const { t } = useTranslation();

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('{', {
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
        selection.insertNodes([$createTextNode(`{{${selectedOption.key}}}`)]);
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
                zIndex={99999}
                maxH={'300px'}
                overflow={'auto'}
              >
                {variables.map((item, index) => (
                  <Flex
                    alignItems={'center'}
                    as={'li'}
                    key={item.key}
                    px={4}
                    py={2}
                    borderRadius={'sm'}
                    cursor={'pointer'}
                    maxH={'300px'}
                    overflow={'auto'}
                    _notLast={{
                      mb: 2
                    }}
                    {...(selectedIndex === index
                      ? {
                          bg: 'primary.50',
                          color: 'primary.600'
                        }
                      : {
                          bg: 'white',
                          color: 'myGray.600'
                        })}
                    onClick={() => {
                      setHighlightedIndex(index);
                      selectOptionAndCleanUp(item);
                    }}
                    onMouseEnter={() => {
                      setHighlightedIndex(index);
                    }}
                  >
                    <MyIcon name={(item.icon as any) || 'core/modules/variable'} w={'14px'} />
                    <Box ml={2} fontSize={'sm'} whiteSpace={'nowrap'}>
                      {item.key}
                      {item.key !== item.label && `(${t(item.label as any)})`}
                    </Box>
                  </Flex>
                ))}
              </Box>,
              anchorElementRef.current
            )
          : null;
      }}
    />
  );
}
