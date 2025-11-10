import React, { useCallback, useRef, useState, useEffect } from 'react';
import Editor, { type Monaco, loader } from '@monaco-editor/react';
import { Box, type BoxProps } from '@chakra-ui/react';
import MyIcon from '../../Icon';
import { getWebReqUrl } from '../../../../common/system/utils';
import usePythonCompletion from './usePythonCompletion';
loader.config({
  paths: { vs: getWebReqUrl('/js/monaco-editor.0.45.0/vs') }
});

type EditorVariablePickerType = {
  key: string;
  label: string;
};

export type Props = Omit<BoxProps, 'resize' | 'onChange'> & {
  resize?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: (e: string) => void;
  onOpenModal?: () => void;
  variables?: EditorVariablePickerType[];
  defaultHeight?: number;
  language?: string;
};

const options = {
  lineNumbers: 'on',
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
  lineNumbersMinChars: 4,
  fontSize: 14,
  scrollBeyondLastLine: false,
  folding: true,
  overviewRulerBorder: false,
  tabSize: 2
};

const MyEditor = ({
  defaultValue,
  value,
  onChange,
  resize,
  variables = [],
  defaultHeight = 200,
  onOpenModal,
  language = 'typescript',
  ...props
}: Props) => {
  const [height, setHeight] = useState(defaultHeight);
  const initialY = useRef(0);

  const registerPythonCompletion = usePythonCompletion();

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    initialY.current = e.clientY;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - initialY.current;
      initialY.current = e.clientY;
      setHeight((prevHeight) => (prevHeight + deltaY < 100 ? 100 : prevHeight + deltaY));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorDidMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }, []);

  const beforeMount = useCallback(
    (monaco: Monaco) => {
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
      registerPythonCompletion(monaco);
    },
    [registerPythonCompletion]
  );

  return (
    <Box
      borderWidth={'1px'}
      borderRadius={'md'}
      borderColor={'myGray.200'}
      py={1}
      height={height}
      position={'relative'}
      {...props}
    >
      <Editor
        height={'100%'}
        language={language}
        options={options as any}
        theme="JSONEditorTheme"
        beforeMount={beforeMount}
        defaultValue={defaultValue}
        value={value}
        onChange={(e) => {
          onChange?.(e || '');
        }}
        onMount={handleEditorDidMount}
      />
      {resize && (
        <Box
          position={'absolute'}
          right={'-2.5'}
          bottom={'-3.5'}
          zIndex={10}
          cursor={'ns-resize'}
          px={'4px'}
          onMouseDown={handleMouseDown}
        >
          <MyIcon name={'common/editor/resizer'} width={'16px'} height={'16px'} />
        </Box>
      )}
      {!!onOpenModal && (
        <Box
          zIndex={10}
          position={'absolute'}
          bottom={0}
          right={2}
          cursor={'pointer'}
          onClick={onOpenModal}
        >
          <MyIcon name={'common/fullScreenLight'} w={'14px'} color={'myGray.600'} />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(MyEditor);
