import { NextAPI } from '@/service/middleware/entry';
import type { ChatCompletionMessageParam, ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { responseWrite } from '@fastgpt/service/common/response';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { createUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { formatModelChars2Points } from '@fastgpt/service/support/wallet/usage/utils';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';

export type WorkflowCopilotBody = {
  userMessage?: string;
  model: string;
  /** 多轮模式：前端维护的完整 LLM 对话历史（system prompt 由后端重建） */
  messages?: ChatCompletionMessageParam[];
  /** 向后兼容：首轮文本历史 */
  conversationHistory?: Array<{ role: string; content: string }>;
  currentWorkflow: {
    nodes: Array<{ nodeId: string; flowNodeType: string; name: string; outputs?: any[] }>;
    edges: Array<{
      source: string;
      target: string;
      sourceHandleKey: string;
      targetHandleKey: string;
    }>;
  };
};

// ─── Tool definitions ──────────────────────────────────────────────────────────

const COPILOT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_app_templates',
      description:
        'Search system workflow templates that may match the user requirement. Call this before building a new workflow. Use matching templates as structural references; if no relevant template exists, build from scratch.',
      parameters: {
        type: 'object',
        properties: {
          requirement: {
            type: 'string',
            description: 'The user requirement to match against system workflow templates.'
          },
          limit: {
            type: 'integer',
            description: 'Maximum number of candidate templates to return. Default 5.'
          }
        },
        required: ['requirement']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_app_template_detail',
      description:
        'Get a summarized workflow structure for a selected system template. Use this only after search_app_templates returns a relevant candidate.',
      parameters: {
        type: 'object',
        properties: {
          templateId: {
            type: 'string',
            description: 'The templateId returned by search_app_templates.'
          }
        },
        required: ['templateId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_workflow',
      description:
        'Get the current workflow state (all nodes and edges, excluding system nodes). Use this to inspect the latest state before deciding what changes to make.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_node',
      description:
        'Add a new node to the workflow canvas. Returns the real nodeId — use it in subsequent add_edge and update_node_inputs calls.',
      parameters: {
        type: 'object',
        properties: {
          node_type: {
            type: 'string',
            description: 'Node type. '
          },
          node_name: { type: 'string', description: 'Display name shown on the node' }
        },
        required: ['node_type', 'node_name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_node',
      description: 'Delete a node and all its connected edges. Cannot delete workflowStart node.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the node to delete' }
        },
        required: ['node_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_classifyQuestion_branch',
      description:
        'Add a new branch to a classifyQuestion node. Returns the branchKey needed for add_edge.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the classifyQuestion node' },
          value: { type: 'string', description: 'Description of this branch, e.g. "Greeting"' }
        },
        required: ['node_id', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_classifyQuestion_branch',
      description: 'Delete a branch from a classifyQuestion node and remove its connected edge.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the classifyQuestion node' },
          key: { type: 'string', description: 'The branch key to delete (e.g. "wqre")' }
        },
        required: ['node_id', 'key']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_ifElseNode_branch',
      description:
        'Add a new condition branch to an ifElseNode. Returns the branchIndex; handle key will be "ELSE IF {branchIndex}".',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the ifElseNode' }
        },
        required: ['node_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_ifElseNode_branch',
      description:
        'Delete a condition branch from an ifElseNode by index. Also removes the connected edge for that branch.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the ifElseNode' },
          index: {
            type: 'integer',
            description: 'Index of the branch to delete (0-based). 0 = "IF", 1 = "ELSE IF 1", etc.'
          }
        },
        required: ['node_id', 'index']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_edge',
      description:
        'Connect two nodes. Use the real nodeIds returned by add_node.\n\nsource_handle_key rules:\n- Default: "right"\n- classifyQuestion: use the branchKey returned by add_classifyQuestion_branch\n- ifElseNode: "IF" (index 0), "ELSE IF 1" (index 1), ..., "ELSE" (else branch)',
      parameters: {
        type: 'object',
        properties: {
          sourceNodeId: { type: 'string', description: 'ID of the source node' },
          targetNodeId: { type: 'string', description: 'ID of the target node' },
          source_handle_key: {
            type: 'string',
            description:
              'Source handle key. Default "right". See description for classifyQuestion and ifElseNode rules.'
          }
        },
        required: ['sourceNodeId', 'targetNodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_edge',
      description: 'Delete the edge between two nodes identified by source handle.',
      parameters: {
        type: 'object',
        properties: {
          sourceNodeId: { type: 'string', description: 'ID of the source node' },
          targetNodeId: { type: 'string', description: 'ID of the target node' },
          source_handle_key: {
            type: 'string',
            description: 'Source handle key. Default "right".'
          }
        },
        required: ['sourceNodeId', 'targetNodeId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'validate_workflow',
      description:
        'Validate the current workflow structure. Only call this when you believe the workflow is complete and ready to verify — not after every individual change.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_node_config_schema',
      description:
        'Get the configurable input parameters AND data outputs for a node type. Call this for every node you add.\n\nReturns four lists:\n- autoConfigurable: inputs you can set directly via update_node_inputs\n- manualConfigRequired: inputs the user must configure later in the node UI (knowledge bases, apps, etc.) — you CANNOT set these and must NOT pause generation\n- referenceInputs: inputs that must be wired via update_node_inputs with value=[sourceNodeId, outputId]\n- outputs: all data outputs this node produces.',
      parameters: {
        type: 'object',
        properties: {
          node_type: { type: 'string', description: 'Node type to query, e.g. "chatNode"' }
        },
        required: ['node_type']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_node_inputs',
      description:
        'Update input values on a node. Use for autoConfigurable inputs (e.g. systemPrompt, text, temperature) AND for referenceInputs (wiring outputs from other nodes). Do NOT use for manualConfigRequired inputs.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the node to update' },
          inputs: {
            type: 'array',
            description: 'Input values to set',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: 'Input key (from get_node_config_schema)' },
                value: { description: 'New value to set' }
              },
              required: ['key', 'value']
            }
          }
        },
        required: ['node_id', 'inputs']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_available_references',
      description:
        'Get all referenceable output variables for a target node, computed from its upstream connected nodes. Returns results grouped by source node. Each output includes a pre-constructed "referenceValue" field — pass this directly as the "value" in update_node_inputs. Do NOT manually construct [nodeId, outputId]; always use the referenceValue from this response.',
      parameters: {
        type: 'object',
        properties: {
          node_id: {
            type: 'string',
            description: 'ID of the target node whose upstream references to compute'
          }
        },
        required: ['node_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_node_detail',
      description:
        'Get detailed information about a specific node instance, including its current input values and outputs. For systemConfig node, returns the current chatConfig values.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the node to inspect' }
        },
        required: ['node_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_system_config',
      description: 'Update systemConfig node parameters (app-level chatConfig).',
      parameters: {
        type: 'object',
        properties: {
          configs: {
            type: 'array',
            description: 'List of config key-value pairs to update',
            items: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description:
                    'Config key. One of: welcomeText(string), variables(array), questionGuide({open,model?,customPrompt?}), autoExecute({open,defaultPrompt}), fileSelectConfig({canSelectFile?,canSelectImg?,maxFiles?}), ttsConfig({type:"none"|"web"|"model",model?,voice?,speed?}), whisperConfig({open,autoSend,autoTTSResponse}), chatInputGuide({open,customUrl})'
                },
                value: { description: 'New value for the config key' }
              },
              required: ['key', 'value']
            }
          }
        },
        required: ['configs']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_node_catch_error',
      description:
        'Enable or disable error catching on a node (only for nodes that support it, i.e. catchError !== undefined in get_workflow). When enabled, a special "catch" handle appears on the node. Use source_handle_key="catch" in add_edge to connect error handling nodes.',
      parameters: {
        type: 'object',
        properties: {
          node_id: { type: 'string', description: 'ID of the node' },
          enable: {
            type: 'boolean',
            description: 'true to enable error catching, false to disable'
          }
        },
        required: ['node_id', 'enable']
      }
    }
  }
];

const SYSTEM_PROMPT = `## Role
You are a FastGPT workflow expert. Build exactly what the user needs: efficient, complete, and verified.

The user provides the full requirement once. Generate the workflow in one continuous run. Do NOT ask follow-up questions, do NOT pause for user input, and do NOT wait for the user to fill node parameters before continuing.

---

## Workflow Process (follow in order)

### Step 1: Search Templates, Inspect & Plan
1. First call search_app_templates with the user's requirement.
2. If a relevant template is returned, call get_app_template_detail for the best candidate and use it as a structural reference: node pattern, branch strategy, prompt/config ideas, and chatConfig ideas.
3. Do NOT blindly copy user-specific resources from templates. Dataset selections, app selections, API credentials, exact schedules, and similar environment-specific values must stay unset and be mentioned in the final summary.
4. If no relevant template exists, build from scratch.
5. Then call get_workflow to see what already exists. State your plan in text: which nodes to add, how to connect them, what to configure.

### Step 2: Add Nodes
Batch: add_node for all new nodes in parallel. Each add_node returns a real nodeId — use these nodeIds in all subsequent steps.
Special — set in the SAME batch as add_node:
- contentExtract → update_node_inputs(nodeId, [{key:"extractKeys", value:[...]}])
- formInput → update_node_inputs(nodeId, [{key:"userInputForms", value:[...]}])

### Step 3: Configure Branches (if needed)
Use the nodeIds returned in Step 2.
classifyQuestion: add_classifyQuestion_branch for each branch → record branchKeys.
ifElseNode: no branch tool needed — branches are defined by ifElseList length in Step 5.
After branches, verify each branch has a downstream node. If missing, add_node now.

### Step 4: Connect Edges
Batch: add_edge for all connections using the real nodeIds from Step 2.
- The workflowStart node's nodeId is returned by get_workflow in Step 1 — use that nodeId directly in add_edge
- classifyQuestion branches: source_handle_key = branchKey from Step 3
- ifElseNode branches: "IF" (0), "ELSE IF 1" (1), ..., "ELSE" (catch-all)
- Each branch → DIFFERENT target node

### Step 5: Configure Node Parameters
For each node needing configuration, use the nodeId from Step 2:
1. get_node_config_schema(node_type) → inspect available inputs
   - **MANDATORY**: check the "manualConfigRequired" list in the schema response.
   - Any item in "manualConfigRequired" CANNOT be set by you. Leave it unset and remember it for the final summary.
2. get_available_references(nodeId) → get upstream variable outputs for wiring
3. update_node_inputs(nodeId, inputs):
   - autoConfigurable: set directly (systemPrompt, text, temperature, etc.)
   - referenceInputs: set value = referenceValue from get_available_references
   - textarea with vars: use {{$nodeId.outputId$}} inline
   - textEditor input key is "system_textareaInput" (NOT "text" or "textareaInput")
   - ifElseList: [{condition:"AND", list:[{variable:[nodeId,outputId], condition:"equalTo", value:"x", valueType:"input"}]}]
   - NEVER call update_node_inputs for manualConfigRequired inputs

Key patterns:
- chatNode / classifyQuestion: wire userChatInput referenceInput from workflowStart
- answerNode: set "text" to fixed string OR wire via referenceValue
- **datasetSearchNode**: always has "datasets" in manualConfigRequired → leave it unset and mention "请选择知识库" in the final summary
- **Any node with knowledge base or app selection**: manualConfigRequired → leave it unset and mention the required manual configuration in the final summary

### Step 6: Validate
Call validate_workflow. It validates graph edges/connectivity and required configurable node parameters. It intentionally excludes manualConfigRequired inputs such as knowledge base IDs, app selections, credentials, and schedules.
- valid=true → write a brief summary of what was built. Include any manualConfigRequired items that remain for the user to configure in the node UI. Done.
- valid=false → go to Step 7.

### Step 7: Fix Validation Issues
For each issue in the validation result:
- "no incoming edges" → add_edge to connect the node
- "is not reachable" → connect the unreachable upstream path so the node is reachable from workflowStart
- "missing required configurable input" → call get_node_config_schema/get_available_references as needed, then update_node_inputs for that key. Do not set manualConfigRequired inputs such as knowledge base IDs.
After fixing: call validate_workflow again. Repeat until valid=true.

---

## Node Types
| type | Name | Purpose |
|---|---|---|
| chatNode | AI Chat | Call LLM for conversation, output AI reply |
| answerNode | Fixed Reply | Output fixed text directly; useful for greetings or prompts |
| textEditor | Text Splicing | Combine multiple text segments or variables; supports {{$nodeId.outputId$}} template syntax |
| classifyQuestion | Question Classifier | Route user input to different branches based on intent |
| ifElseNode | Condition Branch | Execute different branches based on conditions (variable comparison, empty check, etc.) |
| datasetSearchNode | Knowledge Base Search | Semantic/full-text search in knowledge bases; used for RAG pipelines |
| datasetConcatNode | Knowledge Base Merge | Merge results from multiple knowledge base searches using RRF ranking |
| contentExtract | Text Extraction | Extract structured fields from text (SQL, keywords, entities, etc.) |
| httpRequest468 | HTTP Request | Send HTTP requests to external APIs (web search, database queries, etc.) |
| code | Code Runner | Execute JS/Python scripts for complex data processing or logic |
| variableUpdate | Variable Update | Update global variables or the output value of a specified node |
| cfr | Query Rewrite | Rewrite user questions based on chat history to improve knowledge base retrieval precision |
| loop | Batch Execute | Iterate over an array and run the workflow for each element (includes loopStart / loopEnd) |
| userSelect | User Choice | Present clickable options to the user; different choices route to different branches |
| formInput | Form Input | Show a form for users to fill in structured data (text, number, select, etc.) |
| readFiles | File Parser | Parse files uploaded by the user in the current conversation |
| tools | Tool Call (Agent) | AI autonomously decides which tools to call; enables Agent behavior |
| stopTool | Stop Tool Call | Force-stop the current tool call loop; AI will not generate a follow-up answer |
| customFeedback | Custom Feedback | Append a custom feedback record to the current conversation log |

## systemConfig Node
systemConfig is a **special node** present in every workflow. It configures app-level settings (chatConfig) — NOT standard node inputs.
- Does NOT participate in edge connections and has NO outputs for referencing.
- Parameters are set via **update_system_config** tool (NOT update_node_inputs).
- Call get_node_detail(systemConfigNodeId) to see current values before modifying.

**Auto-configurable by model** — use update_system_config:
| key | Type | Description |
|---|---|---|
| welcomeText | string | Welcome message shown when users open the chat |
| variables | array | Pre-chat variables the user fills in before starting (e.g. name, scenario) |
| questionGuide | {open, model?, customPrompt?} | Suggested questions shown near the input box |
| autoExecute | {open, defaultPrompt} | Auto-execute on open without user input |
| fileSelectConfig | {canSelectFile?, canSelectImg?, maxFiles?} | Allow users to upload files or images |
| ttsConfig | {type:"none"\|"web"\|"model", model?, voice?, speed?} | Text-to-speech settings |
| whisperConfig | {open, autoSend, autoTTSResponse} | Voice input settings |
| chatInputGuide | {open, customUrl} | Placeholder or guide text shown in the chat input box |

**Manual node UI configuration** — leave unset and mention in final summary:
| key | Description |
|---|---|
| scheduledTriggerConfig | Scheduled trigger (user must specify the exact time/schedule) |

When the user's request involves systemConfig settings, then call update_system_config directly. For scheduledTriggerConfig, mention that the user must configure the exact schedule in the UI.

## Error Catching
Some nodes support error catching (get_workflow shows catchError field: false=supported but off, true=enabled).
When a user wants to handle node errors gracefully:
1. Call set_node_catch_error(node_id, true) to enable error catching on the node.
2. The node now has a "catch" handle. Add downstream error-handling nodes (e.g. answerNode to display the error message).
3. Use add_edge(sourceNodeId, errorHandlerNodeId, source_handle_key="catch") to connect.
4. The downstream node can reference the error output (key: system_error_text) via get_available_references.

## Rules
- Reference values: always use referenceValue from get_available_references — never guess [nodeId, outputId]
- classifyQuestion: add branches BEFORE connecting edges
- ifElseNode: configure ifElseList via update_node_inputs (NOT add_ifElseNode_branch)
- loop node: loopStart/loopEnd are auto-created; use returned loopStartNodeId/loopEndNodeId
- Dynamic outputs (extractKeys/userInputForms): outputId = field key; set in Step 2`;

// ─── Handler ───────────────────────────────────────────────────────────────────

async function handler(req: ApiRequestProps<WorkflowCopilotBody>, res: ApiResponseType) {
  try {
    const {
      userMessage,
      model,
      conversationHistory = [],
      currentWorkflow,
      messages: incomingMessages
    } = req.body;

    const { teamId, tmbId } = await authCert({ req, authToken: true, authApiKey: true });

    res.setHeader('Content-Type', 'text/event-stream;charset=utf-8');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    const systemMsg: ChatCompletionMessageParam = {
      role: 'system',
      content: SYSTEM_PROMPT
    };
    let messages: ChatCompletionMessageParam[];
    if (incomingMessages?.length) {
      const nonSystem = incomingMessages.filter((m) => m.role !== 'system');
      messages = [systemMsg, ...nonSystem];
    } else {
      messages = [
        systemMsg,
        ...(conversationHistory as ChatCompletionMessageParam[]),
        { role: 'user', content: userMessage! }
      ];
    }

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    // Single LLM call; tools are executed by the frontend, backend is LLM proxy + SSE relay
    const llmResponse = await createLLMResponse({
      body: {
        modelId: model,
        messages,
        tools: COPILOT_TOOLS,
        tool_choice: 'auto',
        toolCallMode: 'toolChoice',
        temperature: 0.1,
        parallel_tool_calls: true,
        stream: true,
        useVision: false,
        // @ts-ignore — disable thinking/reasoning mode
        enable_thinking: false,
        thinking: { type: 'disabled' }
      },
      onStreaming: ({ text }) => {
        responseWrite({
          res,
          event: SseResponseEventEnum.answer,
          data: JSON.stringify({ choices: [{ delta: { content: text } }] })
        });
      },
      onToolCall: ({ call }) => {
        responseWrite({
          res,
          event: SseResponseEventEnum.toolCall,
          data: JSON.stringify({
            tool: { id: call.id, functionName: call.function.name, params: '' }
          })
        });
      },
      onToolParam: ({ tool, params }) => {
        responseWrite({
          res,
          event: SseResponseEventEnum.toolParams,
          data: JSON.stringify({ tool: { id: tool.id, params } })
        });
      }
    });

    totalInputTokens += llmResponse.usage.inputTokens;
    totalOutputTokens += llmResponse.usage.outputTokens;

    // 工具调用：不再在后端执行，只透传给前端执行
    if (llmResponse.toolCalls?.length) {
      for (const call of llmResponse.toolCalls) {
        responseWrite({
          res,
          event: SseResponseEventEnum.toolResponse,
          data: JSON.stringify({
            tool: {
              id: call.id,
              functionName: call.function.name,
              params: call.function.arguments,
              response: ''
            }
          })
        });
      }
    }

    responseWrite({ res, event: SseResponseEventEnum.answer, data: '[DONE]' });

    const { totalPoints } = formatModelChars2Points({
      modelId: model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    });

    await createUsage({
      teamId,
      tmbId,
      appName: i18nT('common:support.wallet.usage.Code Copilot'),
      totalPoints,
      source: UsageSourceEnum.code_copilot,
      list: [
        {
          moduleName: i18nT('common:support.wallet.usage.Code Copilot'),
          amount: totalPoints,
          modelId: model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens
        }
      ]
    });
  } catch (error) {
    console.error(error);
    // 向客户端发送错误事件
    const errorText = getErrText(error, 'Copilot服务异常');
    responseWrite({
      res,
      event: SseResponseEventEnum.error,
      data: JSON.stringify({ error: errorText })
    });
  }
  res.end();
}

export default NextAPI(handler);
