import { VariableItemType } from '@fastgpt/global/core/module/type';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom';
import { VariableInputEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../../Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useBasicTypeaheadTriggerMatch } from '../../utils';

export default function VariablePickerPlugin({ variables }: { variables: VariableItemType[] }) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);
  const { t } = useTranslation();

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('{', {
    minLength: 0
  });

  const VariableTypeList = useMemo(
    () => [
      {
        title: t('core.module.variable.input type'),
        icon: 'core/app/variable/input',
        value: VariableInputEnum.input
      },
      {
        title: t('core.module.variable.textarea type'),
        icon: 'core/app/variable/textarea',
        value: VariableInputEnum.textarea
      },
      {
        title: t('core.module.variable.select type'),
        icon: 'core/app/variable/select',
        value: VariableInputEnum.select
      }
    ],
    [t]
  );

  const options: Array<any> = useMemo(() => {
    return [
      ...variables.map((item) => ({
        ...item,
        icon: VariableTypeList.find((type) => type.value === item.type)?.icon
      }))
    ];
  }, [VariableTypeList, t, variables]);

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
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (anchorElementRef.current == null) {
          return null;
        }
        return anchorElementRef.current && options.length
          ? ReactDOM.createPortal(
              <Box
                bg={'white'}
                boxShadow={'lg'}
                borderWidth={'1px'}
                borderColor={'borderColor.base'}
                p={2}
                borderRadius={'md'}
                position={'fixed'}
                w={'200px'}
                overflow={'hidden'}
                zIndex={99999}
              >
                {options.map((option: any, index) => (
                  <Flex
                    alignItems={'center'}
                    as={'li'}
                    key={option.key}
                    px={4}
                    py={2}
                    borderRadius={'sm'}
                    cursor={'pointer'}
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
                      selectOptionAndCleanUp(option);
                    }}
                    onMouseEnter={() => {
                      setHighlightedIndex(index);
                    }}
                  >
                    <MyIcon name={option.icon} w={'14px'} />
                    <Box ml={2} fontSize={'sm'}>{`${option.key}(${option.label})`}</Box>
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
