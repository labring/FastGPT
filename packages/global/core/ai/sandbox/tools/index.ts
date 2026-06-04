import type { I18nStringType } from '../../../../common/i18n/type';
import type { ChatCompletionTool } from '../../llm/type';
import { SANDBOX_ICON, SANDBOX_NAME } from './common';
import {
  SANDBOX_EDIT_FILE_NAME,
  SANDBOX_EDIT_FILE_TOOL,
  SANDBOX_EDIT_FILE_TOOL_NAME
} from './editFile';
import {
  SANDBOX_GET_FILE_URL_NAME,
  SANDBOX_GET_FILE_URL_TOOL,
  SANDBOX_GET_FILE_URL_TOOL_NAME
} from './getFileUrl';
import {
  SANDBOX_READ_FILE_NAME,
  SANDBOX_READ_FILE_TOOL,
  SANDBOX_READ_FILE_TOOL_NAME
} from './readFile';
import { SANDBOX_SEARCH_NAME, SANDBOX_SEARCH_TOOL, SANDBOX_SEARCH_TOOL_NAME } from './search';
import { SANDBOX_SHELL_TOOL, SANDBOX_SHELL_TOOL_NAME } from './shell';
import {
  SANDBOX_WRITE_FILE_NAME,
  SANDBOX_WRITE_FILE_TOOL,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from './writeFile';

export { AGENT_SANDBOX_TOOLSET_ID, SANDBOX_ICON, SANDBOX_NAME } from './common';
export {
  SANDBOX_EDIT_FILE_NAME,
  SANDBOX_EDIT_FILE_TOOL,
  SANDBOX_EDIT_FILE_TOOL_NAME
} from './editFile';
export {
  SANDBOX_GET_FILE_URL_NAME,
  SANDBOX_GET_FILE_URL_TOOL,
  SANDBOX_GET_FILE_URL_TOOL_NAME
} from './getFileUrl';
export {
  SANDBOX_READ_FILE_NAME,
  SANDBOX_READ_FILE_TOOL,
  SANDBOX_READ_FILE_TOOL_NAME
} from './readFile';
export { SANDBOX_SEARCH_NAME, SANDBOX_SEARCH_TOOL, SANDBOX_SEARCH_TOOL_NAME } from './search';
export { SANDBOX_SHELL_TOOL, SANDBOX_SHELL_TOOL_NAME } from './shell';
export {
  SANDBOX_WRITE_FILE_NAME,
  SANDBOX_WRITE_FILE_TOOL,
  SANDBOX_WRITE_FILE_TOOL_NAME
} from './writeFile';

export const sandboxToolMap: Record<
  string,
  { schema: ChatCompletionTool; name: I18nStringType; avatar: string; toolDescription: string }
> = {
  [SANDBOX_SHELL_TOOL_NAME]: {
    schema: SANDBOX_SHELL_TOOL,
    name: SANDBOX_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_SHELL_TOOL.function.description!
  },
  [SANDBOX_READ_FILE_TOOL_NAME]: {
    schema: SANDBOX_READ_FILE_TOOL,
    name: SANDBOX_READ_FILE_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_READ_FILE_TOOL.function.description!
  },
  [SANDBOX_WRITE_FILE_TOOL_NAME]: {
    schema: SANDBOX_WRITE_FILE_TOOL,
    name: SANDBOX_WRITE_FILE_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_WRITE_FILE_TOOL.function.description!
  },
  [SANDBOX_EDIT_FILE_TOOL_NAME]: {
    schema: SANDBOX_EDIT_FILE_TOOL,
    name: SANDBOX_EDIT_FILE_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_EDIT_FILE_TOOL.function.description!
  },
  [SANDBOX_SEARCH_TOOL_NAME]: {
    schema: SANDBOX_SEARCH_TOOL,
    name: SANDBOX_SEARCH_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_SEARCH_TOOL.function.description!
  },
  [SANDBOX_GET_FILE_URL_TOOL_NAME]: {
    schema: SANDBOX_GET_FILE_URL_TOOL,
    name: SANDBOX_GET_FILE_URL_NAME,
    avatar: SANDBOX_ICON,
    toolDescription: SANDBOX_GET_FILE_URL_TOOL.function.description!
  }
};

export const SANDBOX_TOOLS = Object.values(sandboxToolMap).map((item) => item.schema);
