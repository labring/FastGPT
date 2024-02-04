import React, { useEffect } from 'react';
import Editor, { loader, useMonaco } from '@monaco-editor/react';
import { useCallback, useRef, useState } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import MyIcon from '../../Icon';
import { EditorVariablePickerType } from '../PromptEditor/type';
import { useToast } from '../../../../hooks/useToast';
import { useTranslation } from 'next-i18next';

loader.config({
  paths: { vs: 'https://cdn.staticfile.net/monaco-editor/0.43.0/min/vs' }
});

type Props = Omit<BoxProps, 'onChange' | 'resize' | 'height'> & {
  height?: number;
  resize?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (e: string) => void;
  variables?: EditorVariablePickerType[];
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

const JSONEditor = ({ defaultValue, value, onChange, resize, variables, ...props }: Props) => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [height, setHeight] = useState(props.height || 100);
  const initialY = useRef(0);
  const completionRegisterRef = useRef<any>();
  const monaco = useMonaco();

  useEffect(() => {
    completionRegisterRef.current = monaco?.languages.registerCompletionItemProvider('json', {
      triggerCharacters: ['"'],
      provideCompletionItems: function (model, position) {
        var word = model.getWordUntilPosition(position);
        var range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };
        return {
          suggestions:
            variables?.map((item) => ({
              label: `${item.label}`,
              kind: monaco.languages.CompletionItemKind.Function,
              documentation: item.label,
              insertText: `{{${item.label}}}`,
              range: range
            })) || [],
          dispose: () => {}
        };
      }
    });

    return () => {
      completionRegisterRef.current?.dispose();
    };
  }, [monaco, completionRegisterRef.current]);

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

  return (
    <Box position={'relative'}>
      {resize && (
        <Box
          position={'absolute'}
          right={'0'}
          bottom={'0'}
          zIndex={999}
          cursor={'ns-resize'}
          px={'4px'}
          onMouseDown={handleMouseDown}
        >
          <MyIcon name={'common/editor/resizer'} width={'16px'} height={'16px'} />
        </Box>
      )}

      <Box
        borderWidth={'1px'}
        borderRadius={'md'}
        borderColor={'myGray.200'}
        py={2}
        {...props}
        height={'auto'}
      >
        <Editor
          height={height}
          defaultLanguage="json"
          options={options as any}
          theme={'JSONEditorTheme'}
          beforeMount={(monaco) => {
            monaco?.editor.defineTheme('JSONEditorTheme', {
              base: 'vs',
              inherit: true,
              rules: [],
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
          }}
          defaultValue={defaultValue}
          value={value}
          onChange={(e) => onChange?.(e || '')}
          wrapperProps={{
            onBlur: () => {
              if (!value) return;
              try {
                JSON.parse(value as string);
              } catch (error: any) {
                toast({
                  title: t('common.Invalid Json'),
                  description: error.message,
                  status: 'warning',
                  isClosable: true
                });
              }
            }
          }}
        />
      </Box>
    </Box>
  );
};

export default React.memo(JSONEditor);
