import { VariableItemType } from '@fastgpt/global/core/module/type';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { $createTextNode, $getSelection, $isRangeSelection, TextNode } from 'lexical';
import * as React from 'react';
import { useCallback, useMemo, useState } from 'react';
import * as ReactDOM from 'react-dom';
import styles from '../../index.module.scss';
import { VariableInputEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';
import MyIcon from '../../../../Icon';

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
    // const newVariableOption = {
    //   label: t('common.Add New') + "变量",
    //   key: 'new_variable',
    //   icon: 'core/modules/variable'
    // };
    return [
      ...variables.map((item) => ({
        ...item,
        icon: VariableTypeList.find((type) => type.value === item.type)?.icon
      }))
      // newVariableOption
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
        // if (selectedOption.key === 'new_variable') {
        //   const prefixNode = $createTextNode('{{')
        //   const suffixNode = $createTextNode('}}')
        //   selection.insertNodes([prefixNode, suffixNode])
        //   prefixNode.select()
        // } else {
        selection.insertNodes([$createTextNode(`{{${selectedOption.key}}}`)]);
        // }
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
              <div className={styles.typeaheadPopover}>
                <ul>
                  {options.map((option: any, index) => (
                    <li
                      key={option.key}
                      className={
                        selectedIndex === index ? styles.variableItem_selected : styles.variableItem
                      }
                      onClick={() => {
                        setHighlightedIndex(index);
                        selectOptionAndCleanUp(option);
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(index);
                      }}
                    >
                      <MyIcon
                        name={option.icon}
                        w={'14px'}
                        color={selectedIndex === index ? 'primary.500' : 'myGray.500'}
                      />
                      <span
                        className={styles.variableText}
                      >{`${option.key}(${option.label})`}</span>
                    </li>
                  ))}
                </ul>
              </div>,
              anchorElementRef.current
            )
          : null;
      }}
    />
  );
}
