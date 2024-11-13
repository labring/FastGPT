import React, { useEffect, useCallback, useRef, useState } from 'react';
import Editor, { Monaco, loader, useMonaco } from '@monaco-editor/react';
import { Box, BoxProps } from '@chakra-ui/react';
import MyIcon from '../../Icon';
import { useToast } from '../../../../hooks/useToast';
import { useTranslation } from 'next-i18next';
import { getWebReqUrl } from '../../../../common/system/utils';

loader.config({
  paths: { vs: getWebReqUrl('/js/monaco-editor.0.45.0/vs') }
});

type EditorVariablePickerType = {
  key: string;
  label: string;
};

type Props = Omit<BoxProps, 'resize' | 'onChange'> & {
  height?: number;
  resize?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (e: string) => void;
  variables?: EditorVariablePickerType[];
  defaultHeight?: number;
  placeholder?: string;
  isDisabled?: boolean;
  isInvalid?: boolean;
};

const options = {
  lineNumbers: 'off',
  guides: {
    indentation: false
  },
  automaticLayout: true,
  minimap: {
    enabled: false
  },
  scrollbar: {
    verticalScrollbarSize: 4,
    horizontalScrollbarSize: 8,
    alwaysConsumeMouseWheel: false
  },
  lineNumbersMinChars: 0,
  fontSize: 12,
  scrollBeyondLastLine: false,
  folding: false,
  overviewRulerBorder: false,
  tabSize: 2
};

const JSONEditor = ({
  defaultValue,
  value,
  onChange,
  resize,
  variables = [],
  placeholder,
  defaultHeight = 100,
  isDisabled = false,
  isInvalid = false,
  ...props
}: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [height, setHeight] = useState(defaultHeight);
  const [placeholderDisplay, setPlaceholderDisplay] = useState('block');
  const initialY = useRef(0);
  const completionRegisterRef = useRef<any>();
  const monaco = useMonaco();
  const triggerChar = useRef<string>();

  useEffect(() => {
    if (!monaco) return;

    // 自定义补全提供者
    completionRegisterRef.current = monaco.languages.registerCompletionItemProvider('json', {
      triggerCharacters: ['{'],
      provideCompletionItems: function (model, position, context) {
        const lineContent = model.getLineContent(position.lineNumber);

        if (context.triggerCharacter) {
          triggerChar.current = context.triggerCharacter;
        }
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        const startText = lineContent.substring(0, position.column - 1); // 光标前的文本
        const endText = lineContent.substring(position.column - 1); // 光标后的文本
        const before2Char = startText[startText.length - 2];
        const beforeChar = startText[startText.length - 1];
        const afterChar = endText[0];
        const after2Char = endText[1];

        if (before2Char !== '{' && beforeChar !== '"') {
          return {
            suggestions: []
          };
        }

        return {
          suggestions:
            variables?.map((item) => {
              let insertText = item.key;
              if (before2Char !== '{') {
                insertText = `{${insertText}`;
              }
              if (afterChar !== '}') {
                insertText = `${insertText}}`;
              }
              if (after2Char !== '}') {
                insertText = `${insertText}}`;
              }

              return {
                label: item.key,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: item.label,
                insertText: insertText,
                range
              };
            }) || []
        };
      }
    });

    // 自定义语法高亮
    monaco.languages.setMonarchTokensProvider('json', {
      tokenizer: {
        root: [
          // 匹配variables里的变量
          [new RegExp(`{{(${variables.map((item) => item.key).join('|')})}}`), 'variable'],
          [/".*?"/, 'string'], // 匹配字符串
          [/[{}\[\]]/, '@brackets'], // 匹配括号
          [/[0-9]+/, 'number'], // 匹配数字
          [/true|false/, 'keyword'], // 匹配布尔值
          [/:/, 'delimiter'], // 匹配冒号
          [/,/, 'delimiter.comma'] // 匹配逗号
        ]
      }
    });

    return () => {
      completionRegisterRef.current?.dispose();
    };
  }, [monaco, variables]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    initialY.current = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - initialY.current;
      setHeight((prevHeight) => (prevHeight + deltaY < 100 ? 100 : prevHeight + deltaY));
      initialY.current = e.clientY;
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const onBlur = useCallback(() => {
    if (!value) return;
    // replace {{xx}} to true
    const replaceValue = value?.replace(/{{(.*?)}}/g, 'true');
    try {
      JSON.parse(replaceValue);
    } catch (error) {
      toast({
        status: 'warning',
        title: t('common:common.jsonEditor.Parse error')
      });
    }
  }, [value]);
  const beforeMount = useCallback((monaco: Monaco) => {
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: false,
      allowComments: false,
      schemas: [
        {
          uri: 'http://myserver/foo-schema.json', // 一个假设的 URI
          fileMatch: ['*'], // 匹配所有文件
          schema: {} // 空的 Schema
        }
      ]
    });

    monaco.editor.defineTheme('JSONEditorTheme', {
      base: 'vs', // 可以基于已有的主题进行定制
      inherit: true, // 继承基础主题的设置
      rules: [{ token: 'variable', foreground: '2B5FD9' }],
      colors: {
        'editor.background': '#ffffff00',
        'editorLineNumber.foreground': '#aaa',
        'editorOverviewRuler.border': '#ffffff00',
        'editor.lineHighlightBackground': '#F7F8FA',
        'scrollbarSlider.background': '#E8EAEC',
        'editorIndentGuide.activeBackground': '#ddd',
        'editorIndentGuide.background': '#eee'
      }
    });
  }, []);

  return (
    <Box
      borderWidth={isInvalid ? '2px' : '1px'}
      borderRadius={'md'}
      borderColor={isInvalid ? 'red.500' : 'myGray.200'}
      py={2}
      height={height}
      position={'relative'}
      {...props}
    >
      {resize && (
        <Box
          position={'absolute'}
          right={'0'}
          bottom={'0'}
          zIndex={10}
          cursor={'ns-resize'}
          px={'4px'}
          onMouseDown={handleMouseDown}
        >
          <MyIcon name={'common/editor/resizer'} width={'16px'} height={'16px'} />
        </Box>
      )}
      <Editor
        height={'100%'}
        defaultLanguage="json"
        options={options as any}
        theme="JSONEditorTheme"
        beforeMount={beforeMount}
        defaultValue={defaultValue}
        value={value}
        onChange={(e) => {
          onChange?.(e || '');
          if (!e) {
            setPlaceholderDisplay('block');
          } else {
            setPlaceholderDisplay('none');
          }
        }}
        wrapperProps={{
          onBlur
        }}
        onMount={() => {
          if (!value) {
            setPlaceholderDisplay('block');
          } else {
            setPlaceholderDisplay('none');
          }
        }}
      />
      <Box
        className="monaco-placeholder"
        position={'absolute'}
        top={2}
        left={4}
        fontSize={'xs'}
        color={'myGray.500'}
        display={placeholderDisplay}
      >
        {placeholder}
      </Box>
    </Box>
  );
};

export default React.memo(JSONEditor);
