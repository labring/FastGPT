type TranslationDictionary = Record<string, string>;

export const workflowTemplateResources: Record<string, TranslationDictionary> = {
  en: {
    'app:document_quote': 'Document Citation',
    'app:document_quote_tip':
      'Accepts content from user-uploaded documents after parsing. It can also accept other string data as citations.',
    'app:toolType_http': 'HTTP tools',
    'app:toolType_mcp': 'MCP tools',
    'app:use_agent_sandbox': 'Computer',
    'app:use_computer_desc':
      'When enabled, the AI receives a virtual machine where it can run commands, manage files, and execute code. Each session shares one virtual machine.',
    'app:variable.internal_type_desc': 'Used only inside the Workflow and not shown in the Chat',
    'app:variable.select type_desc':
      'The input box will be displayed in the site conversation and run preview, and this variable will not be displayed in the sharing link.',
    'app:variable.textarea_type_desc':
      'Allows users to input up to 4000 characters in the chat box.',
    'app:workflow.file_url': 'Document Link',
    'app:workflow.form_input': 'Form input',
    'app:workflow.form_input_description_placeholder': 'For example: \nAdd your information',
    'app:workflow.form_input_tip':
      'Use this Node to configure multiple input fields that guide users in providing specific information.',
    'app:workflow.input_description_tip':
      'You can add a description to explain to users what they need to input',
    'app:workflow.read_files': 'Document Parse',
    'app:workflow.read_files_result': 'Document Parsing Result',
    'app:workflow.read_files_result_desc':
      'Original document text, consisting of file names and document content, separated by hyphens between multiple files.',
    'app:workflow.read_files_tip':
      'Parse documents uploaded in the current Chat and return their content',
    'app:workflow.select_description': 'Description Text',
    'app:workflow.select_description_placeholder':
      'For example: \nAre there tomatoes in the fridge?',
    'app:workflow.select_description_tip':
      'You can add a description text to explain the meaning of each option to the user.',
    'app:workflow.select_result': 'Selected Result',
    'app:workflow.user_file_input': 'File Link',
    'app:workflow.user_file_input_desc': 'Links to documents and images uploaded by users.',
    'app:workflow.user_select': 'User Select',
    'app:workflow.user_select_tip':
      'Use this Node to configure options for users to select during a Chat. Each option can lead to a different Workflow branch.',
    'common:core.ai.Model': 'Model',
    'common:core.ai.Prompt': 'Prompt',
    'common:core.app.edit.Query extension background prompt': 'Chat background',
    'common:core.app.edit.Query extension background tip':
      'Describe the scope of the current Chat to help AI rewrite incomplete questions. This usually describes the purpose of the Agent.',
    'common:core.app.tip.chatNodeSystemPromptTip': 'Enter a prompt here',
    'common:core.app.tip.systemPromptTip':
      "Fixed guide words for the model. By adjusting this content, you can guide the model's chat direction. This content will be fixed at the beginning of the context. You can use / to insert variables.\nIf a Dataset is associated, you can also guide the model when to call the Dataset search by appropriate description. For example:\nYou are an assistant for the movie 'Interstellar'. When users ask about content related to 'Interstellar', please search the Dataset and answer based on the search results.",
    'common:core.chat.History': 'History',
    'common:core.chat.Select dataset': 'Select Dataset',
    'common:core.dataset.Dataset': 'Dataset',
    'common:core.dataset.search.ReRank': 'Reranking',
    'common:core.module.Dataset quote.label': 'Dataset citations',
    'common:core.module.QueryExtension.placeholder':
      "For example:\nQuestions about the introduction and use of Python.\nThe current conversation is related to the game 'GTA5'.",
    'common:core.module.http.AppId': 'App ID',
    'common:core.module.http.ChatId': 'Current Chat ID',
    'common:core.module.http.Current time': 'Current Time',
    'common:core.module.http.Histories': 'History Records',
    'common:core.module.http.ResponseChatItemId': 'AI Response ID',
    'common:core.module.input.description.Background':
      'Add context that helps the model classify user questions, especially information the model may not already know.',
    'common:core.module.input.description.HTTP Dynamic Input':
      'Use output from an upstream Node as a Variable in HTTP request parameters.',
    'common:core.module.input.description.Http Request Header':
      'Custom request headers, please strictly fill in the JSON string.\n1. Ensure that the last attribute has no comma\n2. Ensure that the key contains double quotes\nFor example: {"Authorization":"Bearer xxx"}',
    'common:core.module.input.description.Http Request Url':
      "New HTTP request address. If there are two 'request addresses', you can delete this node and re-add it to pull the latest node configuration.",
    'common:core.module.input.description.Response content':
      'Use \\n to insert consecutive line breaks.\nInput from an upstream Node overrides the content entered here.\nNon-string values are converted to strings automatically.',
    'common:core.module.input.label.Background': 'Background Knowledge',
    'common:core.module.input.label.Response content': 'Response Content',
    'common:core.module.input.label.Select dataset': 'Select Dataset',
    'common:core.module.input.label.aiModel': 'AI Model',
    'common:core.module.input.label.chat history': 'Chat History',
    'common:core.module.input.label.user question': 'User Question',
    'common:core.module.input.placeholder.Classify background':
      'For example:\n1. AIGC (Artificial Intelligence Generated Content) refers to the use of artificial intelligence technology to automatically or semi-automatically generate digital content, such as text, images, music, videos, etc.\n2. AIGC technology includes but is not limited to natural language processing, computer vision, machine learning, and deep learning. These technologies can create new content or modify existing content to meet specific creative, educational, entertainment, or informational needs.',
    'common:core.module.output.description.Ai response content':
      'Triggered after the streaming response finishes',
    'common:core.module.output.description.New context':
      'Combine the current response with Chat history and return it as the new context',
    'common:core.module.output.description.query extension result':
      'Returns a string array that can connect directly to User question in Dataset search. Do not connect it to User question in AI Chat.',
    'common:core.module.output.label.Ai response content': 'AI Response Content',
    'common:core.module.output.label.New context': 'New Context',
    'common:core.module.output.label.query extension result': 'Query rewriting result',
    'common:core.module.template.Query extension': 'Query rewriting',
    'common:core.module.variable.variable options': 'Options',
    'common:core.workflow.Dataset quote': 'Dataset citations',
    'common:core.workflow.dynamic_input': 'Dynamic input',
    'common:core.workflow.inputType.custom': 'External Variable',
    'common:core.workflow.inputType.file': 'File upload',
    'common:core.workflow.inputType.internal': 'Internal variables',
    'common:core.workflow.inputType.modelSelect': 'Chat Model Selection',
    'common:core.workflow.inputType.multipleSelect': 'Multiple selection boxes',
    'common:core.workflow.inputType.number input': 'Number Input Box',
    'common:core.workflow.inputType.password': 'Password',
    'common:core.workflow.inputType.select': 'Single Select Box',
    'common:core.workflow.inputType.switch': 'Switch',
    'common:core.workflow.inputType.textInput': 'Text Input box',
    'common:core.workflow.inputType.textarea': 'Multi-line Input Box',
    'common:core.workflow.inputType.timePointSelect': 'Time point',
    'common:core.workflow.inputType.timeRangeSelect': 'Time range',
    'common:navbar.Skill': 'Skill',
    'workflow:Array_element_index': 'Index',
    'workflow:agent.prompt_placeholder':
      'Type “/” to insert a variable reference; type “@” to insert a capability, including Skills, apps, tools, and Datasets.',
    'workflow:agent.tools': 'Tools',
    'workflow:append_application_reply_to_history_as_new_context':
      "Append the app's reply to the history as new context",
    'workflow:application_call': 'App Call',
    'workflow:assigned_reply': 'Assigned Reply',
    'workflow:can_not_add_inside_container': 'This node cannot be added inside this container',
    'workflow:can_not_loop': "This node can't loop.",
    'workflow:can_not_parallel': 'This node cannot be used inside a Parallel Run node',
    'workflow:choose_another_application_to_call': 'Select another app to call',
    'workflow:classification_result': 'Classification Result',
    'workflow:cli.config.auto_execute':
      'Configure this when the app should run automatically as soon as a conversation opens; set both the switch and the default prompt.',
    'workflow:cli.config.auto_execute_open':
      'Enable this only when opening a conversation should immediately run the workflow without waiting for user input.',
    'workflow:cli.config.auto_execute_prompt':
      'Set the user question injected when automatic execution starts; configure it before enabling automatic execution.',
    'workflow:cli.config.chat_input_guide':
      'Configure this when the chat input should use a custom guide page instead of the standard input experience.',
    'workflow:cli.config.file_select':
      'Enable this before building a workflow that consumes files supplied by the user at the chat entry. Select the matching file types; enabling it adds the userFiles output to the workflow start node.',
    'workflow:cli.config.instruction':
      'Configure this when users need persistent usage instructions on the application conversation page.',
    'workflow:cli.config.question_guide':
      'Configure this when the application should generate follow-up question suggestions after a reply; enable it and bind an available model.',
    'workflow:cli.config.question_guide_model':
      'Bind the available model used to generate follow-up question suggestions before enabling the question guide.',
    'workflow:cli.config.question_guide_open':
      'Enable this when users should receive generated follow-up question suggestions after application replies.',
    'workflow:cli.config.question_guide_prompt':
      'Set additional instructions only when generated follow-up question suggestions need application-specific guidance.',
    'workflow:cli.config.scheduled_trigger':
      'Configure this when the workflow must run on a schedule; provide the cron expression, timezone, and injected default prompt together.',
    'workflow:cli.config.tts':
      'Configure this when users need application replies to be read aloud by the browser or a speech model.',
    'workflow:cli.config.welcome_config':
      'Configure the welcome content shown when a new conversation starts.',
    'workflow:cli.config.welcome_questions':
      'Set short, complete questions users can click after the welcome message; keep them specific to the workflow.',
    'workflow:cli.config.welcome_text':
      'Configure this when a new conversation should begin with predefined guidance, examples, or quick actions.',
    'workflow:cli.config.whisper':
      'Configure this when users should be able to submit questions through speech recognition.',
    'workflow:cli.input.ai_model': 'Model used by this AI node',
    'workflow:cli.input.answer': 'Fixed answer text or an upstream output reference',
    'workflow:cli.input.custom_feedback':
      'Feedback text to append to the current conversation record',
    'workflow:cli.input.dataset_quotes': 'Dataset references supplied by an upstream node',
    'workflow:cli.input.system_prompt':
      "Instructions that define the assistant's role and response rules",
    'workflow:cli.input.text_editor':
      'Static text or text assembled from upstream variables. This is a literal text field. Embed references using {{$nodeId.outputKey$}}; global variables use {{$VARIABLE_NODE_ID.variableKey$}}. Do not generate bare {{variableKey}} or {{nodeId.outputKey}} placeholders.',
    'workflow:cli.input.user_question': 'User question supplied by the workflow start node',
    'workflow:code_execution': 'Code run',
    'workflow:code_sandbox_intro':
      'Run a script in the Sandbox for complex data processing. Available syntax and dependencies are limited.',
    'workflow:complete_extraction_result': 'Complete Extraction Result',
    'workflow:complete_extraction_result_description':
      'A JSON string, e.g., {"name":"YY","Time":"2023/7/2 18:00"}',
    'workflow:concatenation_result': 'Concatenation Result',
    'workflow:concatenation_text': 'Concatenation Text',
    'workflow:condition_checker': 'Condition',
    'workflow:contains': 'Contains',
    'workflow:content_to_retrieve': 'Content to Retrieve',
    'workflow:content_to_search': 'Search term or search statement',
    'workflow:current_index': 'Current index',
    'workflow:current_index_desc': '0-based index of the current element in array mode.',
    'workflow:current_item': 'Current item',
    'workflow:current_item_desc': 'Element being processed in the current iteration (array mode).',
    'workflow:current_iteration': 'Current loop count',
    'workflow:current_iteration_desc': '1-based iteration counter in conditional mode.',
    'workflow:custom_feedback': 'Custom Feedback',
    'workflow:end_with': 'Ends With',
    'workflow:error_text': 'Error text',
    'workflow:execute_different_branches_based_on_conditions':
      'Run different branches based on conditions.',
    'workflow:extraction_requirements_description': 'Extraction Requirements Description',
    'workflow:extraction_requirements_description_detail':
      'Provide AI with some background knowledge or requirements to guide it in completing the task better.\\nThis input box can use global variables.',
    'workflow:extraction_requirements_placeholder':
      'Examples: 1. The current time is {{cTime}}. You are a lab booking assistant. Help users book a lab by extracting the booking details from the text.\n2. You are a Google search assistant. Extract suitable search terms from the text.',
    'workflow:feedback_text': 'Feedback Text',
    'workflow:form_input_result': 'User complete input result',
    'workflow:form_input_result_tip': 'an object containing the complete result',
    'workflow:full_field_extraction': 'Full Field Extraction',
    'workflow:full_field_extraction_description':
      'Returns true when all fields are fully extracted (success includes model extraction or using default values)',
    'workflow:full_response_data': 'Full Response Data',
    'workflow:greater_than': 'Greater Than',
    'workflow:greater_than_or_equal_to': 'Greater Than or Equal To',
    'workflow:http_extract_output': 'Output field extraction',
    'workflow:http_extract_output_description':
      'Specified fields in the response value can be extracted through JSONPath syntax',
    'workflow:http_full_error': 'Full error',
    'workflow:http_full_error_description':
      'Complete error object when the HTTP request fails, including message, status, code, data, and other fields.',
    'workflow:http_raw_response_description':
      'Raw HTTP response. Only accepts string or JSON type response data.',
    'workflow:http_request': 'HTTP',
    'workflow:input_variable_list': 'Type / to invoke variable list',
    'workflow:intro_assigned_reply':
      'This node can directly reply with a specified content. Commonly used for guidance or prompts. Non-string content will be converted to string for output.',
    'workflow:intro_custom_feedback':
      'When this Node is triggered, it adds feedback to the current Chat record. Use it to automatically record Chat quality and similar signals.',
    'workflow:intro_custom_plugin_output':
      'Custom configuration of external output. When using plugins, only the custom configured output is exposed.',
    'workflow:intro_http_request':
      'Can send an HTTP request to perform more complex operations (network search, database query, etc.)',
    'workflow:intro_knowledge_base_search_merge':
      'Can merge multiple Dataset search results for output. Uses RRF merging method for final sorting output.',
    'workflow:intro_loop':
      'Provide an array, iterate over its items, and run the Workflow once for each item.',
    'workflow:intro_loop_run':
      "Run a repeating sub-workflow; the loop's outputs decide whether to continue into the next iteration.",
    'workflow:intro_parallel_run':
      'Input an array and run the workflow for each element in parallel, then aggregate the results.',
    'workflow:intro_plugin_input':
      'Can configure what inputs the plugin needs and use these inputs to run the plugin.',
    'workflow:intro_question_classification':
      "Determine the type of question based on the user's history and current question.",
    'workflow:intro_question_optimization':
      'Using query rewriting can improve the accuracy of Dataset searches during continuous conversations. After using this function, AI will first construct one or more new search terms based on the context, which are more conducive to Dataset searches. This node is already built into the Dataset search node. If you only perform a single Dataset search, you can directly use the built-in completion function of the Dataset.',
    'workflow:intro_text_concatenation':
      'Can process and output fixed or incoming text. Non-string type data will be converted to string type.',
    'workflow:intro_text_content_extraction':
      'Can extract specified data from text, such as SQL statements, search keywords, code, etc.',
    'workflow:intro_tool_call_termination':
      'Use this Node with Tool calling. When the Node runs, it immediately ends the current Tool call, and the AI does not respond based on that Tool call result.',
    'workflow:intro_tool_params_config':
      'Use this Node with tool calling to customize tool call parameters and pass them to downstream Nodes.',
    'workflow:is_empty': 'Is Empty',
    'workflow:is_equal_to': 'Is Equal To',
    'workflow:is_not_empty': 'Is Not Empty',
    'workflow:is_not_equal': 'Is Not Equal',
    'workflow:judgment_result': 'Judgment Result',
    'workflow:knowledge_base_reference': 'Dataset citation',
    'workflow:knowledge_base_search_merge': 'Dataset search citation merge',
    'workflow:length_equal_to': 'Length Equal To',
    'workflow:length_greater_than': 'Length Greater Than',
    'workflow:length_greater_than_or_equal_to': 'Length Greater Than or Equal To',
    'workflow:length_less_than': 'Length Less Than',
    'workflow:length_less_than_or_equal_to': 'Length Less Than or Equal To',
    'workflow:length_not_equal_to': 'Length Not Equal To',
    'workflow:less_than': 'Less Than',
    'workflow:less_than_or_equal_to': 'Less Than or Equal To',
    'workflow:loop': 'Batch Run',
    'workflow:loop_custom_outputs': 'Custom outputs',
    'workflow:loop_custom_outputs_tip':
      'Declare output fields exposed by the loop. Each field citations an output of a node inside the sub-workflow.',
    'workflow:loop_end': 'End',
    'workflow:loop_input_array': 'Array',
    'workflow:loop_result': 'Array run results',
    'workflow:loop_run': 'Loop Node',
    'workflow:loop_run_break': 'Loop break',
    'workflow:loop_run_break_must_inside_loop_run':
      'A Loop break Node can only be placed inside a Loop run Node',
    'workflow:loop_run_break_tip':
      'This node must be used inside a loop node. When executed, it will force the loop node to stop running.',
    'workflow:loop_run_input_array': 'Array',
    'workflow:loop_run_mode': 'Loop type',
    'workflow:loop_run_mode_array': 'Array loop',
    'workflow:loop_run_mode_array_desc': 'Process each item in the list in order',
    'workflow:loop_run_mode_conditional': 'Conditional loop',
    'workflow:loop_run_mode_conditional_desc': 'Keep running until a specific condition is met',
    'workflow:loop_run_mode_tip':
      'Choose how the loop is driven: iterate over array elements, or run until a Loop break node is hit.',
    'workflow:loop_run_start': 'Loop start',
    'workflow:loop_start': 'Start',
    'workflow:max_dialog_rounds': 'Maximum Chat history turns',
    'workflow:max_tokens': 'Maximum Tokens',
    'workflow:new_context': 'New Context',
    'workflow:not_contains': 'Does Not Contain',
    'workflow:parallel_full_results': 'Full Results',
    'workflow:parallel_full_results_desc':
      'Array of the same length as the input, each item is {success, message, data}: on success success=true, message is empty, data is the output; on failure success=false, message contains the error, data is null.',
    'workflow:parallel_run': 'Parallel Run',
    'workflow:parallel_run_max_concurrency': 'Max Concurrency',
    'workflow:parallel_run_max_concurrency_tip':
      'Maximum number of tasks running in parallel (range: 1 to the upper limit, default 5).',
    'workflow:parallel_run_max_retry_times': 'Retry Times on Error',
    'workflow:parallel_run_max_retry_times_tip':
      'Maximum number of retries for a failed task (range: 0–5, default 3). Set to 0 to disable retries.',
    'workflow:parallel_status': 'Completion Status',
    'workflow:parallel_status_desc': 'Overall run status: success, partial_success, or failed.',
    'workflow:parallel_success_results': 'Success Results',
    'workflow:parallel_success_results_desc':
      'Outputs from all tasks that ran successfully, ordered by input. Failed tasks are omitted.',
    'workflow:pass_returned_object_as_output_to_next_nodes':
      'Pass the object returned in the code as output to the next nodes. The variable name needs to correspond to the return key.',
    'workflow:plugin_input': 'Plugin Input',
    'workflow:question_classification': 'Classify',
    'workflow:question_classification_default_1': 'Greeting',
    'workflow:question_classification_default_2': 'Question regarding xxx',
    'workflow:question_classification_default_3': 'Other Questions',
    'workflow:question_optimization': 'Query rewriting',
    'workflow:quote_num': 'Citation',
    'workflow:raw_response': 'Raw Response',
    'workflow:reasoning_content': 'Thinking text',
    'workflow:regex': 'Regex',
    'workflow:reply_text': 'Reply Text',
    'workflow:search_query': 'Search content',
    'workflow:select_an_application': 'Select an App',
    'workflow:select_another_application_to_call': 'You can choose another app to call',
    'workflow:special_array_format':
      'Special array format, returns an empty array when the search result is empty.',
    'workflow:start_with': 'Starts With',
    'workflow:tag_filter': 'Tag filter',
    'workflow:tag_filter_description':
      'Currently supports filtering by tags, creation time, and collection IDs to precisely locate matching files and improve retrieval accuracy and efficiency. For example, if a user asks “How long is the validity period?” and the question is known to be about product A on an order, metadata filtering can lock onto files related to product A and avoid searching other files that also mention “validity period.”',
    'workflow:target_fields_description':
      "A target field consists of 'description' and 'key'. Multiple target fields can be extracted.",
    'workflow:template.agent': 'Tool calling',
    'workflow:template.agent_intro': 'AI autonomously manages Tool calling.',
    'workflow:template.agent_module': 'Agent',
    'workflow:template.agent_module_intro':
      'Connect the required Tools and Skills to enable autonomous AI calls and planning',
    'workflow:template.ai_chat': 'AI Chat',
    'workflow:template.ai_chat_intro': 'AI Large Model Chat',
    'workflow:template.dataset_search': 'Dataset Search',
    'workflow:template.dataset_search_intro':
      'Call Semantic search and Full-text search to find content in a Dataset that may be relevant to the question',
    'workflow:template.forbid_stream': 'Forbid stream mode',
    'workflow:template.forbid_stream_desc': 'Force nested Apps to run in non-streaming mode',
    'workflow:template.plugin_output': 'Plugin output',
    'workflow:template.workflow_start': 'Start',
    'workflow:text_concatenation': 'Text Editor',
    'workflow:text_content_extraction': 'Text Extract',
    'workflow:text_to_extract': 'Text to Extract',
    'workflow:these_variables_will_be_input_parameters_for_code_execution':
      'These Variables are used as input parameters for the code run',
    'workflow:tool_call_termination': 'Stop Tool calling',
    'workflow:tool_custom_field': 'Custom Tool Variable',
    'workflow:tool_raw_response_description': 'The original response of the tool',
    'workflow:trigger_after_application_completion':
      'Will be triggered after the app is fully completed',
    'workflow:update_specified_node_output_or_global_variable':
      'Can update the output value of a specified node or update global variables',
    'workflow:use_user_id': 'User ID',
    'workflow:user_question': 'User Question',
    'workflow:variable_update': 'Variable Update',
    'workflow:workflow_builder_version_name': 'AI Version {{versionNo}}'
  },
  'zh-CN': {
    'app:document_quote': '文档引用',
    'app:document_quote_tip':
      '通常用于接受用户上传的文档内容(这需要文档解析)，也可以用于引用其他字符串数据。',
    'app:toolType_http': 'HTTP 工具',
    'app:toolType_mcp': 'MCP 工具',
    'app:use_agent_sandbox': '虚拟机',
    'app:use_computer_desc':
      '开启后，AI 将获得一个虚拟机环境，可执行命令、操作文件、运行代码。每个会话共享一个虚拟机环境。',
    'app:variable.internal_type_desc': '仅在工作流内部使用，不会出现在对话框中',
    'app:variable.select type_desc':
      '会在站内对话和运行预览中显示输入框，在分享链接中不会显示此变量',
    'app:variable.textarea_type_desc': '允许用户最多输入4000字的对话框。',
    'app:workflow.file_url': '文档链接',
    'app:workflow.form_input': '表单输入',
    'app:workflow.form_input_description_placeholder': '例如：\n补充您的信息',
    'app:workflow.form_input_tip': '该模块可以配置多种输入，引导用户输入特定内容。',
    'app:workflow.input_description_tip': '你可以添加一段说明文字，用以向用户说明需要输入的内容',
    'app:workflow.read_files': '文档解析',
    'app:workflow.read_files_result': '文档解析结果',
    'app:workflow.read_files_result_desc':
      '文档原文，由文件名和文档内容组成，多个文件之间通过横线隔开。',
    'app:workflow.read_files_tip': '解析本轮对话上传的文档，并返回对应文档内容',
    'app:workflow.select_description': '说明文字',
    'app:workflow.select_description_placeholder': '例如: \n冰箱里是否有西红柿？',
    'app:workflow.select_description_tip':
      '你可以添加一段说明文字，用以向用户说明每个选项代表的含义。',
    'app:workflow.select_result': '选择结果',
    'app:workflow.user_file_input': '文件链接',
    'app:workflow.user_file_input_desc': '用户上传的文档和图片链接',
    'app:workflow.user_select': '用户选择',
    'app:workflow.user_select_tip':
      '该模块可配置多个选项，以供对话时选择。不同选项可导向不同工作流支线',
    'common:core.ai.Model': 'AI 模型',
    'common:core.ai.Prompt': '提示词',
    'common:core.app.edit.Query extension background prompt': '对话背景描述',
    'common:core.app.edit.Query extension background tip':
      '描述当前对话的范围，便于 AI 为当前问题进行补全和扩展。填写的内容，通常为该助手所用',
    'common:core.app.tip.chatNodeSystemPromptTip': '在此输入提示词',
    'common:core.app.tip.systemPromptTip':
      '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可通过输入 / 插入选择变量\n如果关联了知识库，你还可以通过适当的描述，来引导模型何时去调用知识库搜索。例如：\n你是电影《星际穿越》的助手，当用户询问与《星际穿越》相关的内容时，请搜索知识库并结合搜索结果进行回答。',
    'common:core.chat.History': '历史记录',
    'common:core.chat.Select dataset': '选择知识库',
    'common:core.dataset.Dataset': '知识库',
    'common:core.dataset.search.ReRank': '结果重排',
    'common:core.module.Dataset quote.label': '知识库引用',
    'common:core.module.QueryExtension.placeholder':
      '例如：\n关于 Python 的介绍和使用等问题。\n当前对话与游戏《GTA5》有关。',
    'common:core.module.http.AppId': '应用 ID',
    'common:core.module.http.ChatId': '当前对话 ID',
    'common:core.module.http.Current time': '当前时间',
    'common:core.module.http.Histories': '历史记录',
    'common:core.module.http.ResponseChatItemId': 'AI 回复的 ID',
    'common:core.module.input.description.Background':
      '你可以添加一些特定内容的介绍，从而更好的识别用户的问题类型。这个内容通常是给模型介绍一个它不知道的内容。',
    'common:core.module.input.description.HTTP Dynamic Input':
      '接收前方节点的输出值作为变量，这些变量可以被 HTTP 请求参数使用。',
    'common:core.module.input.description.Http Request Header':
      '自定义请求头，请严格填入 JSON 字符串。\n1. 确保最后一个属性没有逗号\n2. 确保 key 包含双引号\n例如：{"Authorization":"Bearer xxx"}',
    'common:core.module.input.description.Http Request Url':
      '新的 HTTP 请求地址。如果出现两个“请求地址”，可以删除该模块重新加入，会拉取最新的模块配置。',
    'common:core.module.input.description.Response content':
      '可以使用 \\n 来实现连续换行。\n可以通过外部模块输入实现回复，外部模块输入时会覆盖当前填写的内容。\n如传入非字符串类型数据将会自动转成字符串',
    'common:core.module.input.label.Background': '背景知识',
    'common:core.module.input.label.Response content': '回复的内容',
    'common:core.module.input.label.Select dataset': '选择知识库',
    'common:core.module.input.label.aiModel': 'AI 模型',
    'common:core.module.input.label.chat history': '聊天记录',
    'common:core.module.input.label.user question': '用户问题',
    'common:core.module.input.placeholder.Classify background':
      '例如：\n1. AIGC（人工智能生成内容）是指使用人工智能技术自动或半自动地生成数字内容，如文本、图像、音乐、视频等。\n2. AIGC 技术包括但不限于自然语言处理、计算机视觉、机器学习和深度学习。这些技术可以创建新内容或修改现有内容，以满足特定的创意、教育、娱乐或信息需求。',
    'common:core.module.output.description.Ai response content': '将在 stream 回复完毕后触发',
    'common:core.module.output.description.New context':
      '将本次回复内容拼接上历史记录，作为新的上下文返回',
    'common:core.module.output.description.query extension result':
      '以字符串数组的形式输出，可将该结果直接连接到“知识库搜索”的“用户问题”中，建议不要连接到“AI 对话”的“用户问题”中',
    'common:core.module.output.label.Ai response content': 'AI 回复内容',
    'common:core.module.output.label.New context': '新的上下文',
    'common:core.module.output.label.query extension result': '优化结果',
    'common:core.module.template.Query extension': '问题优化',
    'common:core.module.variable.variable options': '选项',
    'common:core.workflow.Dataset quote': '知识库引用',
    'common:core.workflow.dynamic_input': '动态输入',
    'common:core.workflow.inputType.custom': '外部变量',
    'common:core.workflow.inputType.file': '文件上传',
    'common:core.workflow.inputType.internal': '内部变量',
    'common:core.workflow.inputType.modelSelect': '对话模型选择',
    'common:core.workflow.inputType.multipleSelect': '多选框',
    'common:core.workflow.inputType.number input': '数字输入框',
    'common:core.workflow.inputType.password': '密码',
    'common:core.workflow.inputType.select': '单选框',
    'common:core.workflow.inputType.switch': '开关',
    'common:core.workflow.inputType.textInput': '文本输入框',
    'common:core.workflow.inputType.textarea': '多行输入框',
    'common:core.workflow.inputType.timePointSelect': '时间点',
    'common:core.workflow.inputType.timeRangeSelect': '时间范围',
    'common:navbar.Skill': '技能',
    'workflow:Array_element_index': '下标',
    'workflow:agent.prompt_placeholder':
      '输入“/”插入引用变量；输入“@”插入特定能力，包括技能、应用、工具、知识库。',
    'workflow:agent.tools': '工具',
    'workflow:append_application_reply_to_history_as_new_context':
      '将该应用回复内容拼接到历史记录中，作为新的上下文返回',
    'workflow:application_call': '应用调用',
    'workflow:assigned_reply': '指定回复',
    'workflow:can_not_add_inside_container': '该节点不支持添加到当前容器内部',
    'workflow:can_not_loop': '该节点不支持循环嵌套',
    'workflow:can_not_parallel': '该节点不支持在并行执行节点中使用',
    'workflow:choose_another_application_to_call': '选择一个其他应用进行调用',
    'workflow:classification_result': '分类结果',
    'workflow:cli.config.auto_execute':
      '当应用需要在用户进入会话后立即自动运行时配置；应同时设置开启状态和默认问题。',
    'workflow:cli.config.auto_execute_open':
      '仅当进入会话后应立即运行工作流、无需等待用户输入时开启。',
    'workflow:cli.config.auto_execute_prompt':
      '设置自动执行时注入的用户问题；开启自动执行前必须先配置。',
    'workflow:cli.config.chat_input_guide':
      '当对话输入需要使用自定义引导页面而不是标准输入体验时配置。',
    'workflow:cli.config.file_select':
      '当工作流需要消费用户从对话入口提供的文件时，必须在搭建文件处理节点前开启，并选择匹配的文件类型；开启后会为工作流开始节点增加 userFiles 输出。',
    'workflow:cli.config.instruction': '当用户需要在应用对话页持续查看使用说明时配置。',
    'workflow:cli.config.question_guide':
      '当应用回复后需要生成后续问题建议时配置；应开启功能并绑定可用模型。',
    'workflow:cli.config.question_guide_model':
      '绑定用于生成后续问题建议的可用模型；开启问题引导前必须完成配置。',
    'workflow:cli.config.question_guide_open': '当用户应在应用回复后看到生成的后续问题建议时开启。',
    'workflow:cli.config.question_guide_prompt':
      '仅当后续问题建议需要应用特定的生成规则时设置补充提示词。',
    'workflow:cli.config.scheduled_trigger':
      '当工作流需要定时运行时配置；应同时提供 Cron 表达式、时区和注入的默认问题。',
    'workflow:cli.config.tts': '当用户需要通过浏览器或语音模型播报应用回复时配置。',
    'workflow:cli.config.welcome_config': '配置新会话开始时展示的开场内容。',
    'workflow:cli.config.welcome_questions':
      '设置用户可以在开场白后直接点击的问题；问题应简短完整并贴合当前工作流。',
    'workflow:cli.config.welcome_text': '当新会话需要展示预设引导、示例或快捷操作时配置。',
    'workflow:cli.config.whisper': '当用户需要通过语音识别提交问题时配置。',
    'workflow:cli.input.ai_model': '该 AI 节点使用的模型',
    'workflow:cli.input.answer': '固定回答文本或上游输出引用',
    'workflow:cli.input.custom_feedback': '要追加到当前对话记录的反馈内容',
    'workflow:cli.input.dataset_quotes': '由上游节点提供的知识库引用',
    'workflow:cli.input.system_prompt': '定义助手角色和回答规则的指令',
    'workflow:cli.input.text_editor':
      '静态文本或由上游变量拼接的文本。这是纯文本输入框。用 {{$nodeId.outputKey$}} 引用上游输出，全局变量用 {{$VARIABLE_NODE_ID.variableKey$}} 引用。不要生成裸的 {{variableKey}} 或 {{nodeId.outputKey}} 占位符。',
    'workflow:cli.input.user_question': '由工作流开始节点提供的用户问题',
    'workflow:code_execution': '代码运行',
    'workflow:code_sandbox_intro':
      '在沙盒里执行一段脚本代码，可用于进行复杂的数据处理，语法和可用依赖会受到限制。',
    'workflow:complete_extraction_result': '完整提取结果',
    'workflow:complete_extraction_result_description':
      '一个 JSON 字符串，例如：{"name:":"YY","Time":"2023/7/2 18:00"}',
    'workflow:concatenation_result': '拼接结果',
    'workflow:concatenation_text': '拼接文本',
    'workflow:condition_checker': '判断器',
    'workflow:contains': '包含',
    'workflow:content_to_retrieve': '需要检索的内容',
    'workflow:content_to_search': '检索词或检索语句',
    'workflow:current_index': '当前下标',
    'workflow:current_index_desc': '数组模式下当前元素的 0-based 下标。',
    'workflow:current_item': '当前元素',
    'workflow:current_item_desc': '数组模式下当前迭代处理的元素。',
    'workflow:current_iteration': '当前循环次数',
    'workflow:current_iteration_desc': '条件循环模式下的 1-based 迭代次数。',
    'workflow:custom_feedback': '自定义反馈',
    'workflow:end_with': '结束为',
    'workflow:error_text': '错误信息',
    'workflow:execute_different_branches_based_on_conditions': '根据一定的条件，执行不同的分支。',
    'workflow:extraction_requirements_description': '提取要求描述',
    'workflow:extraction_requirements_description_detail':
      '给AI一些对应的背景知识或要求描述，引导AI更好的完成任务。\\n该输入框可使用全局变量。',
    'workflow:extraction_requirements_placeholder':
      '例如: 1. 当前时间为: {{cTime}}。你是一个实验室预约助手，你的任务是帮助用户预约实验室，从文本中获取对应的预约信息。\n2. 你是谷歌搜索助手，需要从文本中提取出合适的搜索词。',
    'workflow:feedback_text': '反馈的文本',
    'workflow:form_input_result': '用户完整输入结果',
    'workflow:form_input_result_tip': '一个包含完整结果的对象',
    'workflow:full_field_extraction': '字段完全提取',
    'workflow:full_field_extraction_description':
      '提取字段全部填充时返回 true （模型提取或使用默认值均属于成功）',
    'workflow:full_response_data': '完整响应数据',
    'workflow:greater_than': '大于',
    'workflow:greater_than_or_equal_to': '大于等于',
    'workflow:http_extract_output': '输出字段提取',
    'workflow:http_extract_output_description': '可以通过 JSONPath 语法来提取响应值中的指定字段',
    'workflow:http_full_error': '完整错误',
    'workflow:http_full_error_description':
      'HTTP 请求失败时的完整错误对象，包含 message、status、code、data 等字段。',
    'workflow:http_raw_response_description':
      'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
    'workflow:http_request': 'HTTP 请求',
    'workflow:input_variable_list': '可输入 / 唤起变量列表',
    'workflow:intro_assigned_reply':
      '该模块可以直接回复一段指定的内容。常用于引导、提示。非字符串内容传入时，会转成字符串进行输出。',
    'workflow:intro_custom_feedback':
      '该模块被触发时，会给当前的对话记录增加一条反馈。可用于自动记录对话效果等。',
    'workflow:intro_custom_plugin_output': '自定义配置外部输出，使用插件时，仅暴露自定义配置的输出',
    'workflow:intro_http_request':
      '可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
    'workflow:intro_knowledge_base_search_merge':
      '可以将多个知识库搜索结果进行合并输出。使用 RRF 的合并方式进行最终排序输出。',
    'workflow:intro_loop': '输入一个数组，遍历数组并将每一个数组元素作为输入元素，执行工作流。',
    'workflow:intro_loop_run': '执行重复性工作流，并由循环结果决定是否进行下一次操作。',
    'workflow:intro_parallel_run':
      '输入一个数组，并行执行工作流中的每一个数组元素，最后将结果汇总输出。',
    'workflow:intro_plugin_input': '可以配置插件需要哪些输入，利用这些输入来运行插件',
    'workflow:intro_question_classification': '根据用户的历史记录和当前问题判断该次提问的类型。',
    'workflow:intro_question_optimization':
      '使用问题优化功能，可以提高知识库连续对话时搜索的精度。使用该功能后，会先利用 AI 根据上下文构建一个或多个新的检索词，这些检索词更利于进行知识库搜索。该模块已内置在知识库搜索模块中，如果您仅进行一次知识库搜索，可直接使用知识库内置的补全功能。',
    'workflow:intro_text_concatenation':
      '可对固定或传入的文本进行加工后输出，非字符串类型数据最终会转成字符串类型。',
    'workflow:intro_text_content_extraction':
      '可从文本中提取指定的数据，例如：sql语句、搜索关键词、代码等',
    'workflow:intro_tool_call_termination':
      '该模块需配置工具调用使用。当该模块被执行时，本次工具调用将会强制结束，并且不再调用AI针对工具调用结果回答问题。',
    'workflow:intro_tool_params_config':
      '该模块需要配合工具调用使用。可以自定义工具调用参数，并传递到下游节点使用',
    'workflow:is_empty': '为空',
    'workflow:is_equal_to': '等于',
    'workflow:is_not_empty': '不为空',
    'workflow:is_not_equal': '不等于',
    'workflow:judgment_result': '判断结果',
    'workflow:knowledge_base_reference': '知识库引用',
    'workflow:knowledge_base_search_merge': '知识库搜索引用合并',
    'workflow:length_equal_to': '长度等于',
    'workflow:length_greater_than': '长度大于',
    'workflow:length_greater_than_or_equal_to': '长度大于等于',
    'workflow:length_less_than': '长度小于',
    'workflow:length_less_than_or_equal_to': '长度小于等于',
    'workflow:length_not_equal_to': '长度不等于',
    'workflow:less_than': '小于',
    'workflow:less_than_or_equal_to': '小于等于',
    'workflow:loop': '批量执行',
    'workflow:loop_custom_outputs': '自定义输出',
    'workflow:loop_custom_outputs_tip':
      '声明对外暴露的输出字段，每个字段引用子流程内某个节点的输出。',
    'workflow:loop_end': '结束',
    'workflow:loop_input_array': '数组',
    'workflow:loop_result': '数组执行结果',
    'workflow:loop_run': '循环节点',
    'workflow:loop_run_break': '循环终止',
    'workflow:loop_run_break_must_inside_loop_run': '循环终止节点只能放在循环执行节点内部',
    'workflow:loop_run_break_tip':
      '该模块需要在循环节点内部使用。当该模块被执行时，将强制结束循环节点的运行。',
    'workflow:loop_run_input_array': '数组',
    'workflow:loop_run_mode': '循环类型',
    'workflow:loop_run_mode_array': '数组循环',
    'workflow:loop_run_mode_array_desc': '按顺序处理列表内每一项',
    'workflow:loop_run_mode_conditional': '条件循环',
    'workflow:loop_run_mode_conditional_desc': '重复运行直至满足特定条件',
    'workflow:loop_run_mode_tip':
      '选择循环驱动方式：按数组元素依次执行，或持续执行直到命中「循环终止」。',
    'workflow:loop_run_start': '循环开始',
    'workflow:loop_start': '开始',
    'workflow:max_dialog_rounds': '最多携带多少轮对话记录',
    'workflow:max_tokens': '最大 Tokens',
    'workflow:new_context': '新的上下文',
    'workflow:not_contains': '不包含',
    'workflow:parallel_full_results': '完整结果',
    'workflow:parallel_full_results_desc':
      '与输入数组等长的结果数组，每项形如 {success, message, data}：成功时 success=true、message 为空、data 为输出值；失败时 success=false、message 为错误信息、data 为 null。',
    'workflow:parallel_run': '并行执行',
    'workflow:parallel_run_max_concurrency': '最大并发数',
    'workflow:parallel_run_max_concurrency_tip':
      '同时并行执行的最大任务数，范围 1～上限值（默认 5）。',
    'workflow:parallel_run_max_retry_times': '单轮报错重试次数',
    'workflow:parallel_run_max_retry_times_tip':
      '单个任务失败后的最大重试次数，范围 0～5（默认 3）。设为 0 表示失败不重试。',
    'workflow:parallel_status': '完成状态',
    'workflow:parallel_status_desc':
      '整体执行状态：success（全部成功）、partial_success（部分失败）、failed（全部失败）。',
    'workflow:parallel_success_results': '成功结果',
    'workflow:parallel_success_results_desc':
      '所有执行成功的任务输出，按输入顺序排列（仅包含成功项）。',
    'workflow:pass_returned_object_as_output_to_next_nodes':
      '将代码中 return 的对象作为输出，传递给后续的节点。变量名需要对应 return 的 key',
    'workflow:plugin_input': '插件输入',
    'workflow:question_classification': '问题分类',
    'workflow:question_classification_default_1': '打招呼',
    'workflow:question_classification_default_2': '关于 xxx 的问题',
    'workflow:question_classification_default_3': '其他问题',
    'workflow:question_optimization': '问题优化',
    'workflow:quote_num': '引用',
    'workflow:raw_response': '原始响应',
    'workflow:reasoning_content': '思考过程',
    'workflow:regex': '正则',
    'workflow:reply_text': '回复的文本',
    'workflow:search_query': '检索内容',
    'workflow:select_an_application': '选择一个应用',
    'workflow:select_another_application_to_call': '可以选择一个其他应用进行调用',
    'workflow:special_array_format': '特殊数组格式，搜索结果为空时，返回空数组。',
    'workflow:start_with': '开始为',
    'workflow:tag_filter': '标签过滤',
    'workflow:tag_filter_description':
      '目前支持标签、创建时间和集合ID过滤，可精确查找对应文件，进而提升检索准确率和效率。如:用户提问“有效期是多久?”，已确定用户询问订单对应产品A，通过元数据过滤，可锁定产品A相关文件，避免在其他含有“有效期”的文件中检索。',
    'workflow:target_fields_description': "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
    'workflow:template.agent': '工具调用',
    'workflow:template.agent_intro': '由 AI 自主决定工具调用。',
    'workflow:template.agent_module': 'Agent',
    'workflow:template.agent_module_intro': '关联所需工具及技能，可实现 AI 自主调用与规划',
    'workflow:template.ai_chat': 'AI 对话',
    'workflow:template.ai_chat_intro': 'AI 大模型对话',
    'workflow:template.dataset_search': '知识库搜索',
    'workflow:template.dataset_search_intro':
      '调用“语义检索”和“全文检索”能力，从“知识库”中查找可能与问题相关的参考内容',
    'workflow:template.forbid_stream': '禁用流输出',
    'workflow:template.forbid_stream_desc': '强制设置嵌套运行的应用，均以非流模式运行',
    'workflow:template.plugin_output': '插件输出',
    'workflow:template.workflow_start': '流程开始',
    'workflow:text_concatenation': '文本拼接',
    'workflow:text_content_extraction': '文本内容提取',
    'workflow:text_to_extract': '需要提取的文本',
    'workflow:these_variables_will_be_input_parameters_for_code_execution':
      '这些变量会作为代码的运行的输入参数',
    'workflow:tool_call_termination': '工具调用终止',
    'workflow:tool_custom_field': '自定义工具变量',
    'workflow:tool_raw_response_description': '工具的原始响应',
    'workflow:trigger_after_application_completion': '将在应用完全结束后触发',
    'workflow:update_specified_node_output_or_global_variable':
      '可以更新指定节点的输出值或更新全局变量',
    'workflow:use_user_id': '使用者 ID',
    'workflow:user_question': '用户问题',
    'workflow:variable_update': '变量更新',
    'workflow:workflow_builder_version_name': 'AI 生成版本 {{versionNo}}'
  },
  'zh-Hant': {
    'app:document_quote': '文件引用',
    'app:document_quote_tip':
      '通常用於接受使用者上傳的文件內容（這需要文件解析），也可以用於引用其他字串資料。',
    'app:toolType_http': 'HTTP 工具',
    'app:toolType_mcp': 'MCP 工具',
    'app:use_agent_sandbox': '虛擬機',
    'app:use_computer_desc':
      '開啟後，AI 會獲得可執行指令、管理檔案及執行程式碼的虛擬機器環境。每個工作階段共用一個虛擬機器。',
    'app:variable.internal_type_desc': '僅在工作流內部使用，不會出現在對話框中',
    'app:variable.select type_desc':
      '會在站內對話和運行預覽中顯示輸入框，在分享鏈接中不會顯示此變量',
    'app:variable.textarea_type_desc': '允許使用者最多輸入 4000 字的對話框。',
    'app:workflow.file_url': '檔案連結',
    'app:workflow.form_input': '表單輸入',
    'app:workflow.form_input_description_placeholder': '例如：\n補充您的資訊',
    'app:workflow.form_input_tip': '這個模組可以設定多種輸入，引導使用者輸入特定內容。',
    'app:workflow.input_description_tip': '您可以新增一段說明文字，用來向使用者說明需要輸入的內容',
    'app:workflow.read_files': '檔案解析',
    'app:workflow.read_files_result': '檔案解析結果',
    'app:workflow.read_files_result_desc':
      '檔案原文，由檔案名稱和檔案內容組成，多個檔案之間透過橫線分隔。',
    'app:workflow.read_files_tip': '解析本輪對話上傳的檔案，並回傳對應檔案內容',
    'app:workflow.select_description': '說明文字',
    'app:workflow.select_description_placeholder': '例如：\n冰箱裡是否有番茄？',
    'app:workflow.select_description_tip':
      '您可以新增一段說明文字，用來向使用者說明每個選項代表的意義。',
    'app:workflow.select_result': '選擇結果',
    'app:workflow.user_file_input': '檔案連結',
    'app:workflow.user_file_input_desc': '使用者上傳的檔案和圖片連結',
    'app:workflow.user_select': '使用者選擇',
    'app:workflow.user_select_tip':
      '這個模組可以設定多個選項，供對話時選擇。不同選項可以導向不同的工作流程支線',
    'common:core.ai.Model': 'AI 模型',
    'common:core.ai.Prompt': '提示詞',
    'common:core.app.edit.Query extension background prompt': '對話背景描述',
    'common:core.app.edit.Query extension background tip':
      '描述目前對話的範圍，協助 AI 完成並擴展目前問題。填寫的內容通常是為該助手所用',
    'common:core.app.tip.chatNodeSystemPromptTip': '在此輸入提示詞',
    'common:core.app.tip.systemPromptTip':
      '模型固定的引導詞，透過調整此內容，可以引導模型對話方向。此內容會固定在上下文的開頭。可透過輸入 / 插入變數。\n如果關聯了知識庫，您還可以透過適當的描述，引導模型何時去呼叫知識庫搜尋。例如：\n您是電影《星際效應》的助手，當使用者詢問與《星際效應》相關的內容時，請搜尋知識庫並根據搜尋結果回答。',
    'common:core.chat.History': '記錄',
    'common:core.chat.Select dataset': '選擇知識庫',
    'common:core.dataset.Dataset': '知識庫',
    'common:core.dataset.search.ReRank': '結果重新排名',
    'common:core.module.Dataset quote.label': '知識庫引用',
    'common:core.module.QueryExtension.placeholder':
      '例如：\n關於 Python 的介紹和使用等問題。\n目前對話與遊戲《GTA5》有關。',
    'common:core.module.http.AppId': '應用程式 ID',
    'common:core.module.http.ChatId': '目前對話 ID',
    'common:core.module.http.Current time': '目前時間',
    'common:core.module.http.Histories': '歷史記錄',
    'common:core.module.http.ResponseChatItemId': 'AI 回應的 ID',
    'common:core.module.input.description.Background':
      '您可以新增一些特定內容的介紹，以更好地識別使用者的問題類型。這個內容通常是介紹一個模型不知道的內容。',
    'common:core.module.input.description.HTTP Dynamic Input':
      '接收前一個節點的輸出值作為變數，這些變數可以被 HTTP 請求參數使用。',
    'common:core.module.input.description.Http Request Header':
      '自訂請求標頭，請嚴格填寫 JSON 字串。\n1. 確保最後一個屬性沒有逗號\n2. 確保鍵值包含雙引號\n例如：{"Authorization":"Bearer xxx"}',
    'common:core.module.input.description.Http Request Url':
      '新的 HTTP 請求網址。如果出現兩個「請求網址」，您可以刪除此模組並重新新增，以取得最新的模組設定。',
    'common:core.module.input.description.Response content':
      '您可以使用 \\n 來達成連續換行。\n可以透過外部模組輸入來實現回覆，外部模組輸入時會覆蓋目前填寫的內容。\n如果傳入非字串類型資料將會自動轉換為字串',
    'common:core.module.input.label.Background': '背景知識',
    'common:core.module.input.label.Response content': '回覆內容',
    'common:core.module.input.label.Select dataset': '選擇知識庫',
    'common:core.module.input.label.aiModel': 'AI 模型',
    'common:core.module.input.label.chat history': '對話記錄',
    'common:core.module.input.label.user question': '使用者問題',
    'common:core.module.input.placeholder.Classify background':
      '例如：\n1. AIGC（人工智慧生成內容）是指使用人工智慧技術自動或半自動產生數位內容，如文字、影像、音樂、影片等。\n2. AIGC 技術包括但不限於自然語言處理、電腦視覺、機器學習和深度學習。這些技術可以創造新內容或修改現有內容，以滿足特定的創意、教育、娛樂或資訊需求。',
    'common:core.module.output.description.Ai response content': '將在串流回覆完成後觸發',
    'common:core.module.output.description.New context':
      '將本次回覆內容與歷史記錄組合，作為新的上下文回傳',
    'common:core.module.output.description.query extension result':
      '以字串陣列形式輸出，可直接連接到「知識庫搜尋」的「使用者問題」。建議不要連接到「AI 對話」的「使用者問題」',
    'common:core.module.output.label.Ai response content': 'AI 回覆內容',
    'common:core.module.output.label.New context': '新的上下文',
    'common:core.module.output.label.query extension result': '最佳化結果',
    'common:core.module.template.Query extension': '問題最佳化',
    'common:core.module.variable.variable options': '選項',
    'common:core.workflow.Dataset quote': '知識庫引用',
    'common:core.workflow.dynamic_input': '動態輸入',
    'common:core.workflow.inputType.custom': '外部變數',
    'common:core.workflow.inputType.file': '文件上傳',
    'common:core.workflow.inputType.internal': '內部變量',
    'common:core.workflow.inputType.modelSelect': '對話模型選擇',
    'common:core.workflow.inputType.multipleSelect': '多選框',
    'common:core.workflow.inputType.number input': '數字輸入框',
    'common:core.workflow.inputType.password': '密碼',
    'common:core.workflow.inputType.select': '單選框',
    'common:core.workflow.inputType.switch': '開關',
    'common:core.workflow.inputType.textInput': '文字輸入框',
    'common:core.workflow.inputType.textarea': '多行輸入框',
    'common:core.workflow.inputType.timePointSelect': '時間點',
    'common:core.workflow.inputType.timeRangeSelect': '時間範圍',
    'common:navbar.Skill': '技能',
    'workflow:Array_element_index': '索引',
    'workflow:agent.prompt_placeholder':
      '輸入「/」插入引用變數；輸入「@」插入特定能力，包括技能、應用、工具、知識庫。',
    'workflow:agent.tools': '工具',
    'workflow:append_application_reply_to_history_as_new_context':
      '將應用程式的回覆附加到歷史紀錄中，作為新的脈絡',
    'workflow:application_call': '應用程式呼叫',
    'workflow:assigned_reply': '指定回覆',
    'workflow:can_not_add_inside_container': '該節點不支援新增到當前容器內部',
    'workflow:can_not_loop': '這個節點不能迴圈。',
    'workflow:can_not_parallel': '該節點不支援在並行執行節點中使用',
    'workflow:choose_another_application_to_call': '選擇另一個應用程式來呼叫',
    'workflow:classification_result': '分類結果',
    'workflow:cli.config.auto_execute':
      '當應用程式需要在使用者進入對話後立即自動執行時設定；應同時設定開啟狀態和預設問題。',
    'workflow:cli.config.auto_execute_open':
      '僅當進入對話後應立即執行工作流程、無需等待使用者輸入時開啟。',
    'workflow:cli.config.auto_execute_prompt':
      '設定自動執行時注入的使用者問題；開啟自動執行前必須先設定。',
    'workflow:cli.config.chat_input_guide':
      '當對話輸入需要使用自訂引導頁面而不是標準輸入體驗時設定。',
    'workflow:cli.config.file_select':
      '當工作流程需要使用者從對話入口提供檔案時，必須在建立檔案處理節點前開啟，並選擇相符的檔案類型；開啟後會為工作流程開始節點增加 userFiles 輸出。',
    'workflow:cli.config.instruction': '當使用者需要在應用程式對話頁持續查看使用說明時設定。',
    'workflow:cli.config.question_guide':
      '當應用程式回覆後需要產生後續問題建議時設定；應開啟功能並綁定可用模型。',
    'workflow:cli.config.question_guide_model':
      '綁定用於產生後續問題建議的可用模型；開啟問題引導前必須完成設定。',
    'workflow:cli.config.question_guide_open':
      '當使用者應在應用程式回覆後看到產生的後續問題建議時開啟。',
    'workflow:cli.config.question_guide_prompt':
      '僅當後續問題建議需要應用程式特定的產生規則時設定補充提示詞。',
    'workflow:cli.config.scheduled_trigger':
      '當工作流程需要定時執行時設定；應同時提供 Cron 表達式、時區和注入的預設問題。',
    'workflow:cli.config.tts': '當使用者需要透過瀏覽器或語音模型播報應用程式回覆時設定。',
    'workflow:cli.config.welcome_config': '設定新對話開始時顯示的開場內容。',
    'workflow:cli.config.welcome_questions':
      '設定使用者可在開場白後直接點選的問題；問題應簡短完整並符合目前工作流程。',
    'workflow:cli.config.welcome_text': '當新對話需要顯示預設引導、範例或快捷操作時設定。',
    'workflow:cli.config.whisper': '當使用者需要透過語音識別提交問題時設定。',
    'workflow:cli.input.ai_model': '此 AI 節點使用的模型',
    'workflow:cli.input.answer': '固定回答文字或上游輸出引用',
    'workflow:cli.input.custom_feedback': '要附加到目前對話記錄的回饋內容',
    'workflow:cli.input.dataset_quotes': '由上游節點提供的知識庫引用',
    'workflow:cli.input.system_prompt': '定義助手角色和回答規則的指令',
    'workflow:cli.input.text_editor':
      '靜態文字或由上游變數組合的文字。這是純文字輸入框。用 {{$nodeId.outputKey$}} 引用上游輸出，全域變數用 {{$VARIABLE_NODE_ID.variableKey$}} 引用。不要產生裸的 {{variableKey}} 或 {{nodeId.outputKey}} 佔位符。',
    'workflow:cli.input.user_question': '由工作流程開始節點提供的使用者問題',
    'workflow:code_execution': '程式碼執行',
    'workflow:code_sandbox_intro':
      '在沙盒裡執行一段腳本程式碼，可用於進行複雜的資料處理，語法和可用依賴會受到限制。',
    'workflow:complete_extraction_result': '完整擷取結果',
    'workflow:complete_extraction_result_description':
      '一個 JSON 字串，例如：{"name":"YY","Time":"2023/7/2 18:00"}',
    'workflow:concatenation_result': '串接結果',
    'workflow:concatenation_text': '串接文字',
    'workflow:condition_checker': '條件檢查器',
    'workflow:contains': '包含',
    'workflow:content_to_retrieve': '要擷取的內容',
    'workflow:content_to_search': '檢索字或檢索語句',
    'workflow:current_index': '目前索引',
    'workflow:current_index_desc': '陣列模式下目前元素的 0-based 索引。',
    'workflow:current_item': '目前元素',
    'workflow:current_item_desc': '陣列模式下目前迭代處理的元素。',
    'workflow:current_iteration': '目前迴圈次數',
    'workflow:current_iteration_desc': '條件迴圈模式下的 1-based 迭代次數。',
    'workflow:custom_feedback': '自訂回饋',
    'workflow:end_with': '結尾為',
    'workflow:error_text': '錯誤訊息',
    'workflow:execute_different_branches_based_on_conditions': '根據條件執行不同的分支。',
    'workflow:extraction_requirements_description': '擷取需求描述',
    'workflow:extraction_requirements_description_detail':
      '提供 AI 相對應的背景知識或需求描述，引導 AI 更好地完成任務。\\n這個輸入框可以使用全域變數。',
    'workflow:extraction_requirements_placeholder':
      '例如：1. 目前時間為 {{cTime}}。你是實驗室預約助手，請從文字中提取預約資訊並協助使用者預約實驗室。\n2. 你是 Google 搜尋助手，請從文字中提取合適的搜尋詞。',
    'workflow:feedback_text': '回饋文字',
    'workflow:form_input_result': '使用者完整輸入結果',
    'workflow:form_input_result_tip': '一個包含完整結果的物件',
    'workflow:full_field_extraction': '欄位完整擷取',
    'workflow:full_field_extraction_description':
      '當所有欄位都被完整擷取時回傳 true（模型擷取或使用預設值都算成功）',
    'workflow:full_response_data': '完整回應資料',
    'workflow:greater_than': '大於',
    'workflow:greater_than_or_equal_to': '大於或等於',
    'workflow:http_extract_output': '輸出欄位擷取',
    'workflow:http_extract_output_description': '可以透過 JSONPath 語法來擷取回應值中的指定欄位',
    'workflow:http_full_error': '完整錯誤',
    'workflow:http_full_error_description':
      'HTTP 請求失敗時的完整錯誤物件，包含 message、status、code、data 等欄位。',
    'workflow:http_raw_response_description':
      'HTTP 請求的原始回應。僅接受字串或 JSON 類型回應資料。',
    'workflow:http_request': 'HTTP 請求',
    'workflow:input_variable_list': '輸入 / 叫出變數清單',
    'workflow:intro_assigned_reply':
      '這個模組可以直接回覆指定的內容。常用於引導、提示。非字串內容傳入時，會轉換成字串輸出。',
    'workflow:intro_custom_feedback':
      '當這個模組被觸發時，會在目前的對話紀錄中新增一條回饋。可以用於自動記錄對話效果等等。',
    'workflow:intro_custom_plugin_output': '自訂設定外部輸出，使用外掛程式時，只顯示自訂設定的輸出',
    'workflow:intro_http_request':
      '可以傳送 HTTP 請求，執行更複雜的操作（網路搜尋、資料庫查詢等等）',
    'workflow:intro_knowledge_base_search_merge':
      '可以合併多個知識庫搜尋結果並輸出。使用 RRF 合併方法進行最終排序輸出。',
    'workflow:intro_loop': '輸入一個陣列，遍歷陣列並將每個陣列元素作為輸入元素，執行工作流程。',
    'workflow:intro_loop_run': '執行重複性工作流，由迴圈結果決定是否進行下一次操作。',
    'workflow:intro_parallel_run':
      '輸入一個陣列，並行執行工作流中的每一個陣列元素，最後將結果匯總輸出。',
    'workflow:intro_plugin_input': '可以設定外掛程式需要的輸入，並利用這些輸入來執行外掛程式',
    'workflow:intro_question_classification': '根據使用者的歷史紀錄和目前問題判斷這次提問的類型。',
    'workflow:intro_question_optimization':
      '使用問題最佳化功能，可以提升知識庫連續對話時的搜尋精準度。使用這個功能後，會先利用 AI 根據脈絡建構一個或多個新的檢索詞彙，這些詞彙更有利於知識庫搜尋。這個模組已內建於知識庫搜尋模組中，如果您只進行一次知識庫搜尋，可以直接使用知識庫內建的自動完成功能。',
    'workflow:intro_text_concatenation':
      '可以處理並輸出固定的或傳入的文字。非字串類型的資料會被轉換成字串類型。',
    'workflow:intro_text_content_extraction':
      '可以從文字中擷取指定的資料，例如：SQL 敘述、搜尋關鍵字、程式碼等等',
    'workflow:intro_tool_call_termination':
      '這個模組需要搭配工具呼叫使用。當這個模組被執行時，這次的工具呼叫會被強制終止，AI 不會再根據工具呼叫結果回答問題。',
    'workflow:intro_tool_params_config':
      '此節點需搭配工具呼叫使用，可自訂工具呼叫參數並傳遞給下游節點。',
    'workflow:is_empty': '為空',
    'workflow:is_equal_to': '等於',
    'workflow:is_not_empty': '不為空',
    'workflow:is_not_equal': '不等於',
    'workflow:judgment_result': '判斷結果',
    'workflow:knowledge_base_reference': '知識庫引用',
    'workflow:knowledge_base_search_merge': '知識庫搜尋合併',
    'workflow:length_equal_to': '長度等於',
    'workflow:length_greater_than': '長度大於',
    'workflow:length_greater_than_or_equal_to': '長度大於或等於',
    'workflow:length_less_than': '長度小於',
    'workflow:length_less_than_or_equal_to': '長度小於或等於',
    'workflow:length_not_equal_to': '長度不等於',
    'workflow:less_than': '小於',
    'workflow:less_than_or_equal_to': '小於或等於',
    'workflow:loop': '大量執行',
    'workflow:loop_custom_outputs': '自訂輸出',
    'workflow:loop_custom_outputs_tip':
      '宣告對外曝露的輸出欄位，每個欄位引用子流程內某個節點的輸出。',
    'workflow:loop_end': '結束',
    'workflow:loop_input_array': '陣列',
    'workflow:loop_result': '陣列執行結果',
    'workflow:loop_run': '迴圈節點',
    'workflow:loop_run_break': '迴圈終止',
    'workflow:loop_run_break_must_inside_loop_run': '迴圈終止節點只能放在迴圈執行節點內部',
    'workflow:loop_run_break_tip':
      '此模組需要在迴圈節點內部使用。當此模組被執行時，將強制結束迴圈節點的執行。',
    'workflow:loop_run_input_array': '陣列',
    'workflow:loop_run_mode': '迴圈類型',
    'workflow:loop_run_mode_array': '陣列迴圈',
    'workflow:loop_run_mode_array_desc': '依序處理清單內每一項',
    'workflow:loop_run_mode_conditional': '條件迴圈',
    'workflow:loop_run_mode_conditional_desc': '重複執行直到滿足特定條件',
    'workflow:loop_run_mode_tip':
      '選擇迴圈驅動方式：依陣列元素逐一執行，或持續執行直到命中「迴圈終止」。',
    'workflow:loop_run_start': '迴圈開始',
    'workflow:loop_start': '開始',
    'workflow:max_dialog_rounds': '最多攜帶幾輪對話紀錄',
    'workflow:max_tokens': '最大 Token 數',
    'workflow:new_context': '新的脈絡',
    'workflow:not_contains': '不包含',
    'workflow:parallel_full_results': '完整結果',
    'workflow:parallel_full_results_desc':
      '與輸入陣列等長的結果陣列，每項形如 {success, message, data}：成功時 success=true、message 為空、data 為輸出值；失敗時 success=false、message 為錯誤訊息、data 為 null。',
    'workflow:parallel_run': '並行執行',
    'workflow:parallel_run_max_concurrency': '最大並發數',
    'workflow:parallel_run_max_concurrency_tip':
      '同時並行執行的最大任務數，範圍 1～上限值（預設 5）。',
    'workflow:parallel_run_max_retry_times': '單輪報錯重試次數',
    'workflow:parallel_run_max_retry_times_tip':
      '單個任務失敗後的最大重試次數，範圍 0～5（預設 3）。設為 0 表示失敗不重試。',
    'workflow:parallel_status': '完成狀態',
    'workflow:parallel_status_desc':
      '整體執行狀態：success（全部成功）、partial_success（部分失敗）、failed（全部失敗）。',
    'workflow:parallel_success_results': '成功結果',
    'workflow:parallel_success_results_desc':
      '所有執行成功的任務輸出，按輸入順序排列（僅包含成功項）。',
    'workflow:pass_returned_object_as_output_to_next_nodes':
      '將程式碼中 return 的物件作為輸出，傳遞給後續的節點。變數名稱需要對應 return 的鍵值',
    'workflow:plugin_input': '外掛程式輸入',
    'workflow:question_classification': '問題分類',
    'workflow:question_classification_default_1': '打招呼',
    'workflow:question_classification_default_2': '關於 xxx 的問題',
    'workflow:question_classification_default_3': '其他問題',
    'workflow:question_optimization': '問題最佳化',
    'workflow:quote_num': '引用數量',
    'workflow:raw_response': '原始回應',
    'workflow:reasoning_content': '思考過程',
    'workflow:regex': '正規表達式',
    'workflow:reply_text': '回覆文字',
    'workflow:search_query': '檢索內容',
    'workflow:select_an_application': '選擇一個應用程式',
    'workflow:select_another_application_to_call': '可以選擇另一個應用程式來呼叫',
    'workflow:special_array_format': '特殊陣列格式，搜尋結果為空時，回傳空陣列。',
    'workflow:start_with': '開頭為',
    'workflow:tag_filter': '標籤過濾',
    'workflow:tag_filter_description':
      '目前支援標籤、建立時間和集合ID過濾，可精確查找對應檔案，進而提升檢索準確率和效率。如：使用者提問「有效期是多久？」，已確定使用者詢問訂單對應產品A，透過詮釋資料過濾，可鎖定產品A相關檔案，避免在其他含有「有效期」的檔案中檢索。',
    'workflow:target_fields_description':
      '由「描述」和「鍵值」組成一個目標欄位，可以擷取多個目標欄位',
    'workflow:template.agent': '工具呼叫',
    'workflow:template.agent_intro':
      '透過 AI 模型自動選擇一或多個功能區塊進行呼叫，也可以呼叫外掛程式。',
    'workflow:template.agent_module': 'Agent',
    'workflow:template.agent_module_intro': '關聯所需工具及技能，可實現 AI 自主呼叫與規劃',
    'workflow:template.ai_chat': 'AI 對話',
    'workflow:template.ai_chat_intro': 'AI 大型語言模型對話',
    'workflow:template.dataset_search': '知識庫搜尋',
    'workflow:template.dataset_search_intro':
      '使用「語意搜尋」和「全文搜尋」功能，從「知識庫」中尋找可能與問題相關的參考內容',
    'workflow:template.forbid_stream': '停用串流輸出',
    'workflow:template.forbid_stream_desc': '強制設定巢狀執行的應用程式以非串流模式執行',
    'workflow:template.plugin_output': '外掛程式輸出',
    'workflow:template.workflow_start': '流程開始',
    'workflow:text_concatenation': '文字串接',
    'workflow:text_content_extraction': '文字內容擷取',
    'workflow:text_to_extract': '要擷取的文字',
    'workflow:these_variables_will_be_input_parameters_for_code_execution':
      '這些變數會作為程式碼執行的輸入參數',
    'workflow:tool_call_termination': '工具呼叫終止',
    'workflow:tool_custom_field': '自訂工具變數',
    'workflow:tool_raw_response_description': '工具的原始響應',
    'workflow:trigger_after_application_completion': '將會在應用程式完全結束後觸發',
    'workflow:update_specified_node_output_or_global_variable':
      '可以更新指定節點的輸出值或更新全域變數',
    'workflow:use_user_id': '使用者 ID',
    'workflow:user_question': '使用者問題',
    'workflow:variable_update': '變數更新',
    'workflow:workflow_builder_version_name': 'AI 生成版本 {{versionNo}}'
  },
  'ko-KR': {
    'app:document_quote': '문서 인용',
    'app:document_quote_tip':
      '일반적으로 사용자가 업로드한 문서 내용을 받는 데 사용되며(문서 분석 필요), 다른 문자열 데이터를 인용하는 데도 사용할 수 있습니다.',
    'app:toolType_http': 'HTTP 도구',
    'app:toolType_mcp': 'MCP 도구',
    'app:use_agent_sandbox': '컴퓨터',
    'app:use_computer_desc':
      '활성화하면 AI가 명령을 실행하고, 파일을 조작하고, 코드를 실행할 수 있는 가상 머신 환경을 갖게 됩니다. 각 세션은 하나의 가상 머신 환경을 공유합니다.',
    'app:variable.internal_type_desc': '워크플로 내부에서만 사용되며 대화창에는 표시되지 않습니다',
    'app:variable.select type_desc':
      '입력란은 사이트 대화 및 실행 미리보기에 표시되며, 이 변수는 공유 링크에는 표시되지 않습니다.',
    'app:variable.textarea_type_desc': '사용자가 대화창에 최대 4000자까지 입력할 수 있습니다.',
    'app:workflow.file_url': '문서 링크',
    'app:workflow.form_input': '폼 입력',
    'app:workflow.form_input_description_placeholder': '예: \n귀하의 정보를 추가하세요',
    'app:workflow.form_input_tip':
      '  이 노드는 여러 입력을 설정하여 사용자가 특정 내용을 입력하도록 안내할 수 있습니다.',
    'app:workflow.input_description_tip':
      '사용자에게 무엇을 입력해야 하는지 설명하는 문구를 추가할 수 있습니다',
    'app:workflow.read_files': '문서 분석',
    'app:workflow.read_files_result': '문서 분석 결과',
    'app:workflow.read_files_result_desc':
      '파일 이름과 문서 내용으로 구성된 원본 문서 텍스트로, 여러 파일은 하이픈으로 구분됩니다.',
    'app:workflow.read_files_tip':
      '이번 대화 라운드에서 업로드된 문서를 분석하여 해당 문서 내용을 반환합니다',
    'app:workflow.select_description': '설명 텍스트',
    'app:workflow.select_description_placeholder': '예: \n냉장고에 토마토가 있나요?',
    'app:workflow.select_description_tip':
      '각 옵션의 의미를 사용자에게 설명하는 텍스트를 추가할 수 있습니다.',
    'app:workflow.select_result': '선택된 결과',
    'app:workflow.user_file_input': '파일 링크',
    'app:workflow.user_file_input_desc': '사용자가 업로드한 문서와 이미지의 링크입니다.',
    'app:workflow.user_select': '사용자 선택',
    'app:workflow.user_select_tip':
      '이 노드는 대화 중 선택할 수 있는 여러 옵션을 설정할 수 있습니다. 옵션에 따라 서로 다른 워크플로 분기로 이어질 수 있습니다.',
    'common:core.ai.Model': '모델',
    'common:core.ai.Prompt': '프롬프트',
    'common:core.app.edit.Query extension background prompt': '대화 배경 설명',
    'common:core.app.edit.Query extension background tip':
      '현재 대화의 범위를 설명하여 AI가 현재 질문을 완성하고 확장하는 데 도움을 줍니다. 여기에 입력하는 내용은 일반적으로 이 어시스턴트에 대한 것입니다.',
    'common:core.app.tip.chatNodeSystemPromptTip': '여기에 프롬프트를 입력하세요',
    'common:core.app.tip.systemPromptTip':
      "모델에 대한 고정 안내 문구입니다. 이 내용을 조정하여 모델의 대화 방향을 안내할 수 있습니다. 이 내용은 컨텍스트의 맨 앞에 고정됩니다. /로 변수를 삽입할 수 있습니다.\n데이터셋이 연결되어 있다면, 적절한 설명으로 모델에게 언제 데이터셋 검색을 호출해야 하는지 안내할 수도 있습니다. 예:\n당신은 영화 '인터스텔라'의 어시스턴트입니다. 사용자가 '인터스텔라'와 관련된 내용을 물으면 데이터셋을 검색하고 검색 결과를 바탕으로 답변해 주세요.",
    'common:core.chat.History': '이력',
    'common:core.chat.Select dataset': '데이터셋 선택',
    'common:core.dataset.Dataset': '데이터셋',
    'common:core.dataset.search.ReRank': '리랭킹',
    'common:core.module.Dataset quote.label': '데이터셋 인용',
    'common:core.module.QueryExtension.placeholder':
      "예:\nPython 소개와 사용법에 관한 질문입니다.\n현재 대화는 게임 'GTA5'와 관련이 있습니다.",
    'common:core.module.http.AppId': '앱 ID',
    'common:core.module.http.ChatId': '현재 대화 ID',
    'common:core.module.http.Current time': '현재 시간',
    'common:core.module.http.Histories': '이력 기록',
    'common:core.module.http.ResponseChatItemId': 'AI 응답 ID',
    'common:core.module.input.description.Background':
      '사용자 질문의 유형을 더 잘 식별하기 위한 특정 내용 소개를 추가할 수 있습니다. 이 내용은 일반적으로 모델이 모르는 것을 소개하는 데 사용됩니다.',
    'common:core.module.input.description.HTTP Dynamic Input':
      '이전 노드의 출력값을 변수로 받아 HTTP 요청 파라미터에서 사용할 수 있습니다.',
    'common:core.module.input.description.Http Request Header':
      '사용자 정의 요청 헤더이며, JSON 문자열을 엄격히 입력해 주세요.\n1. 마지막 속성에는 쉼표가 없는지 확인하세요\n2. 키에 큰따옴표가 포함되어 있는지 확인하세요\n예: {"Authorization":"Bearer xxx"}',
    'common:core.module.input.description.Http Request Url':
      "새 HTTP 요청 주소입니다. '요청 주소'가 두 개인 경우 이 노드를 삭제하고 다시 추가하여 최신 노드 설정을 불러올 수 있습니다.",
    'common:core.module.input.description.Response content':
      '\\n을 사용하여 연속 줄바꿈을 구현할 수 있습니다.\n외부 노드 입력을 통해 응답을 구현할 수 있으며, 여기에 입력한 내용은 외부 노드 입력에 의해 덮어씌워집니다.\n문자열이 아닌 타입의 데이터가 전달되면 자동으로 문자열로 변환됩니다',
    'common:core.module.input.label.Background': '배경 지식',
    'common:core.module.input.label.Response content': '응답 내용',
    'common:core.module.input.label.Select dataset': '데이터셋 선택',
    'common:core.module.input.label.aiModel': 'AI 모델',
    'common:core.module.input.label.chat history': '대화 이력',
    'common:core.module.input.label.user question': '사용자 질문',
    'common:core.module.input.placeholder.Classify background':
      '예:\n1. AIGC(인공지능 생성 콘텐츠)는 인공지능 기술을 사용하여 텍스트, 이미지, 음악, 영상 등의 디지털 콘텐츠를 자동 또는 반자동으로 생성하는 것을 말합니다.\n2. AIGC 기술은 자연어 처리, 컴퓨터 비전, 머신러닝, 딥러닝 등을 포함하지만 이에 국한되지 않습니다. 이러한 기술은 특정한 창작, 교육, 오락 또는 정보 요구를 충족시키기 위해 새로운 콘텐츠를 만들거나 기존 콘텐츠를 수정할 수 있습니다.',
    'common:core.module.output.description.Ai response content':
      '스트림 응답이 완료된 후 트리거됩니다',
    'common:core.module.output.description.New context':
      '현재 응답 내용을 이력 기록과 결합하여 새 컨텍스트로 반환합니다',
    'common:core.module.output.description.query extension result':
      "문자열 배열로 출력되며, '데이터셋 검색'의 '사용자 질문'에 직접 연결할 수 있습니다. 'AI 대화'의 '사용자 질문'에는 연결하지 않는 것을 권장합니다",
    'common:core.module.output.label.Ai response content': 'AI 응답 내용',
    'common:core.module.output.label.New context': '새 컨텍스트',
    'common:core.module.output.label.query extension result': '최적화 결과',
    'common:core.module.template.Query extension': '쿼리 재작성',
    'common:core.module.variable.variable options': '옵션',
    'common:core.workflow.Dataset quote': '데이터셋 인용',
    'common:core.workflow.dynamic_input': '동적 입력',
    'common:core.workflow.inputType.custom': '외부 변수',
    'common:core.workflow.inputType.file': '파일 업로드',
    'common:core.workflow.inputType.internal': '내부 변수',
    'common:core.workflow.inputType.modelSelect': '대화 모델 선택',
    'common:core.workflow.inputType.multipleSelect': '다중 선택 박스',
    'common:core.workflow.inputType.number input': '숫자 입력란',
    'common:core.workflow.inputType.password': '비밀번호',
    'common:core.workflow.inputType.select': '단일 선택 박스',
    'common:core.workflow.inputType.switch': '스위치',
    'common:core.workflow.inputType.textInput': '텍스트 입력란',
    'common:core.workflow.inputType.textarea': '여러 줄 입력란',
    'common:core.workflow.inputType.timePointSelect': '시간 지점',
    'common:core.workflow.inputType.timeRangeSelect': '시간 범위',
    'common:navbar.Skill': '스킬',
    'workflow:Array_element_index': '인덱스',
    'workflow:agent.prompt_placeholder':
      '“/”를 입력해 참조 변수를 삽입하고, “@”를 입력해 스킬, 앱, 도구, 지식베이스 등의 기능을 삽입하세요.',
    'workflow:agent.tools': '도구',
    'workflow:append_application_reply_to_history_as_new_context':
      '앱의 응답을 새로운 컨텍스트로 기록에 추가합니다',
    'workflow:application_call': '앱 호출',
    'workflow:assigned_reply': '지정 응답',
    'workflow:can_not_add_inside_container': '이 노드는 현재 컨테이너 내부에 추가할 수 없습니다',
    'workflow:can_not_loop': '이 노드는 반복 실행할 수 없습니다.',
    'workflow:can_not_parallel': '이 노드는 병렬 실행 노드 내부에서 사용할 수 없습니다',
    'workflow:choose_another_application_to_call': '호출할 다른 앱 선택',
    'workflow:classification_result': '분류 결과',
    'workflow:cli.config.auto_execute':
      '대화 진입 시 즉시 자동 실행해야 하는 경우 구성합니다. 스위치와 기본 프롬프트를 함께 설정해야 합니다.',
    'workflow:cli.config.auto_execute_open':
      '대화 진입 즉시 사용자 입력 없이 워크플로를 실행해야 하는 경우에만 활성화합니다.',
    'workflow:cli.config.auto_execute_prompt':
      '자동 실행 시 주입할 사용자 질문을 설정합니다. 자동 실행을 활성화하기 전에 먼저 구성해야 합니다.',
    'workflow:cli.config.chat_input_guide':
      '채팅 입력에 표준 입력 대신 맞춤 가이드 페이지를 사용해야 하는 경우 구성합니다.',
    'workflow:cli.config.file_select':
      '워크플로에서 사용자가 대화 시작 시 제공한 파일을 소비해야 하는 경우 활성화하고 일치하는 파일 형식을 선택합니다. 활성화하면 시작 노드에 userFiles 출력이 추가됩니다.',
    'workflow:cli.config.instruction':
      '사용자가 대화 페이지에서 지속적으로 사용 지침을 확인해야 하는 경우 구성합니다.',
    'workflow:cli.config.question_guide':
      '응답 후 후속 질문 추천을 생성해야 하는 경우 구성합니다. 기능을 활성화하고 사용 가능한 모델을 바인딩해야 합니다.',
    'workflow:cli.config.question_guide_model':
      '후속 질문 추천 생성에 사용할 모델을 바인딩합니다. 질문 가이드를 활성화하기 전에 먼저 구성해야 합니다.',
    'workflow:cli.config.question_guide_open':
      '응답 후 생성된 후속 질문 추천을 사용자에게 표시해야 하는 경우 활성화합니다.',
    'workflow:cli.config.question_guide_prompt':
      '후속 질문 추천에 애플리케이션별 생성 규칙이 필요한 경우에만 추가 프롬프트를 설정합니다.',
    'workflow:cli.config.scheduled_trigger':
      '워크플로를 예약 실행해야 하는 경우 구성합니다. Cron 표현식, 표준 시간대, 기본 질문을 함께 제공해야 합니다.',
    'workflow:cli.config.tts':
      '브라우저나 음성 모델을 통해 응답을 음성으로 읽어주어야 하는 경우 구성합니다.',
    'workflow:cli.config.welcome_config': '새 대화가 시작될 때 표시할 시작 콘텐츠를 구성합니다.',
    'workflow:cli.config.welcome_questions':
      '환영 메시지 뒤에 사용자가 클릭할 수 있는 짧고 완전한 질문을 설정합니다.',
    'workflow:cli.config.welcome_text':
      '새 대화 시작 시 사전 설정된 가이드, 예시 또는 빠른 작업을 표시해야 하는 경우 구성합니다.',
    'workflow:cli.config.whisper': '음성 인식을 통해 질문을 제출할 수 있어야 하는 경우 구성합니다.',
    'workflow:cli.input.ai_model': '이 AI 노드에서 사용하는 모델',
    'workflow:cli.input.answer': '고정 응답 텍스트 또는 업스트림 출력 참조',
    'workflow:cli.input.custom_feedback': '현재 대화 기록에 추가할 피드백 내용',
    'workflow:cli.input.dataset_quotes': '상위 노드에서 제공하는 데이터셋 참조',
    'workflow:cli.input.system_prompt': '어시스턴트 역할과 응답 규칙을 정의하는 지침',
    'workflow:cli.input.text_editor':
      '정적 텍스트 또는 업스트림 변수로 결합된 텍스트입니다. 이것은 순수 텍스트 입력란입니다. 상위 출력은 {{$nodeId.outputKey$}}로, 전역 변수는 {{$VARIABLE_NODE_ID.variableKey$}}로 참조하세요. {{variableKey}} 또는 {{nodeId.outputKey}} 형태의 자리표시자를 그대로 만들지 마세요.',
    'workflow:cli.input.user_question': '워크플로 시작 노드에서 제공하는 사용자 질문',
    'workflow:code_execution': '코드 샌드박스',
    'workflow:code_sandbox_intro':
      '샌드박스에서 스크립트 코드를 실행하면 복잡한 데이터 처리를 수행할 수 있지만, 문법과 사용 가능한 의존성에는 제한이 있습니다.',
    'workflow:complete_extraction_result': '전체 추출 결과',
    'workflow:complete_extraction_result_description':
      'JSON 문자열, 예: {"name":"YY","Time":"2023/7/2 18:00"}',
    'workflow:concatenation_result': '연결 결과',
    'workflow:concatenation_text': '연결 텍스트',
    'workflow:condition_checker': '조건',
    'workflow:contains': '포함',
    'workflow:content_to_retrieve': '검색할 내용',
    'workflow:content_to_search': '검색어 또는 검색 문장',
    'workflow:current_index': '현재 인덱스',
    'workflow:current_index_desc': '배열 모드에서 현재 요소의 0부터 시작하는 인덱스입니다.',
    'workflow:current_item': '현재 항목',
    'workflow:current_item_desc': '현재 반복(배열 모드)에서 처리 중인 요소입니다.',
    'workflow:current_iteration': '현재 반복 횟수',
    'workflow:current_iteration_desc': '조건 모드에서 1부터 시작하는 반복 카운터입니다.',
    'workflow:custom_feedback': '사용자 정의 피드백',
    'workflow:end_with': '다음으로 끝남',
    'workflow:error_text': '오류 텍스트',
    'workflow:execute_different_branches_based_on_conditions':
      '조건에 따라 서로 다른 분기를 실행합니다.',
    'workflow:extraction_requirements_description': '추출 요구사항 설명',
    'workflow:extraction_requirements_description_detail':
      'AI가 작업을 더 잘 완료하도록 배경 지식이나 요구사항을 제공하세요.\\n이 입력란에서는 전역 변수를 사용할 수 있습니다.',
    'workflow:extraction_requirements_placeholder':
      '예: 1. 현재 시간은 {{cTime}}입니다. 당신은 실험실 예약 에이전트이며 텍스트에서 예약 정보를 추출하여 사용자의 실험실 예약을 지원해야 합니다.\n2. 당신은 Google 검색 에이전트이며 텍스트에서 적절한 검색어를 추출해야 합니다.',
    'workflow:feedback_text': '피드백 텍스트',
    'workflow:form_input_result': '사용자 전체 입력 결과',
    'workflow:form_input_result_tip': '전체 결과를 포함한 객체',
    'workflow:full_field_extraction': '전체 필드 추출',
    'workflow:full_field_extraction_description':
      '모든 필드가 완전히 추출되면 true를 반환합니다(모델 추출 또는 기본값 사용에 의한 성공 포함)',
    'workflow:full_response_data': '전체 응답 데이터',
    'workflow:greater_than': '보다 큼',
    'workflow:greater_than_or_equal_to': '보다 크거나 같음',
    'workflow:http_extract_output': '출력 필드 추출',
    'workflow:http_extract_output_description':
      'JSONPath 문법으로 응답 값에서 지정된 필드를 추출할 수 있습니다',
    'workflow:http_full_error': '전체 오류',
    'workflow:http_full_error_description':
      'HTTP 요청 실패 시 message, status, code, data 등을 포함한 전체 오류 객체입니다.',
    'workflow:http_raw_response_description':
      '원본 HTTP 응답입니다. 문자열 또는 JSON 타입의 응답 데이터만 허용합니다.',
    'workflow:http_request': 'HTTP',
    'workflow:input_variable_list': '/를 입력하여 변수 목록 호출',
    'workflow:intro_assigned_reply':
      '이 노드는 지정된 내용으로 직접 응답할 수 있습니다. 안내나 알림에 자주 사용됩니다. 문자열이 아닌 내용은 문자열로 변환되어 출력됩니다.',
    'workflow:intro_custom_feedback':
      '이 노드가 트리거되면 현재 대화 기록에 피드백이 추가됩니다. 대화 효과를 자동으로 기록하는 데 사용할 수 있습니다.',
    'workflow:intro_custom_plugin_output':
      '외부 출력의 사용자 정의 설정입니다. 플러그인 사용 시 사용자 정의로 설정한 출력만 노출됩니다.',
    'workflow:intro_http_request':
      'HTTP 요청을 보내 더 복잡한 작업(웹 검색, 데이터베이스 조회 등)을 수행할 수 있습니다',
    'workflow:intro_knowledge_base_search_merge':
      '여러 데이터셋 검색 결과를 병합하여 출력할 수 있습니다. RRF 병합 방식으로 최종 정렬 출력합니다.',
    'workflow:intro_loop':
      '배열을 입력받아 배열을 순회하며 각 요소를 입력값으로 사용해 워크플로를 실행합니다.',
    'workflow:intro_loop_run':
      '반복되는 하위 워크플로를 실행하며, 반복의 출력값이 다음 반복으로 진행할지를 결정합니다.',
    'workflow:intro_parallel_run':
      '배열을 입력받아 각 요소에 대해 워크플로를 병렬로 실행한 후 결과를 취합합니다.',
    'workflow:intro_plugin_input':
      '플러그인에 필요한 입력을 설정하고 이 입력들을 사용해 플러그인을 실행할 수 있습니다.',
    'workflow:intro_question_classification':
      "사용자의 이력과 현재 질문을 바탕으로 질문 유형을 판단합니다. 여러 질문 유형을 추가할 수 있습니다. 아래는 템플릿 예시입니다:\n유형1: 인사\n유형2: 제품 '사용법'에 대한 질문\n유형3: 제품 '구매'에 대한 질문\n유형4: 기타 질문",
    'workflow:intro_question_optimization':
      '쿼리 재작성을 사용하면 연속 대화 중 데이터셋 검색의 정확도를 높일 수 있습니다. 이 기능을 사용하면 AI가 먼저 문맥을 기반으로 데이터셋 검색에 더 적합한 하나 이상의 새로운 검색어를 구성합니다. 이 노드는 이미 데이터셋 검색 노드에 내장되어 있습니다. 단일 데이터셋 검색만 수행하는 경우, 데이터셋에 내장된 완성 기능을 바로 사용할 수 있습니다.',
    'workflow:intro_text_concatenation':
      '고정된 텍스트나 전달받은 텍스트를 처리하여 출력할 수 있습니다. 문자열이 아닌 데이터는 문자열로 변환됩니다.',
    'workflow:intro_text_content_extraction':
      '텍스트에서 SQL 문, 검색 키워드, 코드 등 지정된 데이터를 추출할 수 있습니다.',
    'workflow:intro_tool_call_termination':
      '도구 호출에는 이 노드를 설정해야 합니다. 이 노드가 실행되면 현재 도구 호출이 강제로 종료되며, AI는 더 이상 도구 호출 결과를 기반으로 답변하지 않습니다.',
    'workflow:intro_tool_params_config':
      '이 노드는 도구 호출과 함께 사용해야 합니다. 도구 호출 파라미터를 사용자 정의하여 하위 노드로 전달해 사용할 수 있습니다.',
    'workflow:is_empty': '비어 있음',
    'workflow:is_equal_to': '같음',
    'workflow:is_not_empty': '비어 있지 않음',
    'workflow:is_not_equal': '같지 않음',
    'workflow:judgment_result': '판단 결과',
    'workflow:knowledge_base_reference': '데이터셋 인용',
    'workflow:knowledge_base_search_merge': '데이터셋 검색 인용 병합',
    'workflow:length_equal_to': '길이가 같음',
    'workflow:length_greater_than': '길이가 큼',
    'workflow:length_greater_than_or_equal_to': '길이가 크거나 같음',
    'workflow:length_less_than': '길이가 작음',
    'workflow:length_less_than_or_equal_to': '길이가 작거나 같음',
    'workflow:length_not_equal_to': '길이가 같지 않음',
    'workflow:less_than': '보다 작음',
    'workflow:less_than_or_equal_to': '보다 작거나 같음',
    'workflow:loop': '배치 실행',
    'workflow:loop_custom_outputs': '사용자 정의 출력',
    'workflow:loop_custom_outputs_tip':
      '반복문이 노출하는 출력 필드를 선언합니다. 각 필드는 하위 워크플로 내 노드의 출력을 인용합니다.',
    'workflow:loop_end': '종료',
    'workflow:loop_input_array': '배열',
    'workflow:loop_result': '배열 실행 결과',
    'workflow:loop_run': '반복 노드',
    'workflow:loop_run_break': '반복 중단',
    'workflow:loop_run_break_must_inside_loop_run':
      '반복 중단 노드는 반복 컨테이너 내부에만 배치할 수 있습니다',
    'workflow:loop_run_break_tip':
      '이 노드는 반복 노드 내부에서만 사용해야 합니다. 실행되면 반복 노드의 실행을 강제로 중지합니다.',
    'workflow:loop_run_input_array': '배열',
    'workflow:loop_run_mode': '반복 유형',
    'workflow:loop_run_mode_array': '배열 반복',
    'workflow:loop_run_mode_array_desc': '목록의 각 항목을 순서대로 처리합니다',
    'workflow:loop_run_mode_conditional': '조건 반복',
    'workflow:loop_run_mode_conditional_desc': '특정 조건이 충족될 때까지 계속 실행합니다',
    'workflow:loop_run_mode_tip':
      '반복 실행 방식을 선택하세요: 배열 요소를 순회하거나, 반복 중단 노드에 도달할 때까지 실행합니다.',
    'workflow:loop_run_start': '반복 시작',
    'workflow:loop_start': '시작',
    'workflow:max_dialog_rounds': '포함할 최대 채팅 기록 라운드 수',
    'workflow:max_tokens': '최대 토큰 수',
    'workflow:new_context': '새 컨텍스트',
    'workflow:not_contains': '포함하지 않음',
    'workflow:parallel_full_results': '전체 결과',
    'workflow:parallel_full_results_desc':
      '입력과 동일한 길이의 배열이며, 각 항목은 {success, message, data} 형식입니다: 성공 시 success=true, message는 비어 있고 data는 출력값입니다; 실패 시 success=false, message에 오류가 담기고 data는 null입니다.',
    'workflow:parallel_run': '병렬 실행',
    'workflow:parallel_run_max_concurrency': '최대 동시 실행 수',
    'workflow:parallel_run_max_concurrency_tip':
      '병렬로 실행되는 최대 작업 수(범위: 1~상한, 기본값 5).',
    'workflow:parallel_run_max_retry_times': '오류 시 재시도 횟수',
    'workflow:parallel_run_max_retry_times_tip':
      '실패한 작업의 최대 재시도 횟수(범위: 0~5, 기본값 3). 0으로 설정하면 재시도를 비활성화합니다.',
    'workflow:parallel_status': '완료 상태',
    'workflow:parallel_status_desc': '전체 실행 상태: success, partial_success 또는 failed.',
    'workflow:parallel_success_results': '성공 결과',
    'workflow:parallel_success_results_desc':
      '입력 순서대로 정리된 모든 성공 작업의 출력값입니다(성공 항목만 포함).',
    'workflow:pass_returned_object_as_output_to_next_nodes':
      '코드에서 반환된 객체를 다음 노드의 출력으로 전달합니다. 변수 이름은 반환 키와 일치해야 합니다.',
    'workflow:plugin_input': '플러그인 입력',
    'workflow:question_classification': '분류',
    'workflow:question_classification_default_1': '인사',
    'workflow:question_classification_default_2': 'xxx 관련 질문',
    'workflow:question_classification_default_3': '기타 질문',
    'workflow:question_optimization': '쿼리 재작성',
    'workflow:quote_num': '인용',
    'workflow:raw_response': '원본 응답',
    'workflow:reasoning_content': '사고 과정 텍스트',
    'workflow:regex': '정규식',
    'workflow:reply_text': '응답 텍스트',
    'workflow:search_query': '검색 내용',
    'workflow:select_an_application': '앱 선택',
    'workflow:select_another_application_to_call': '호출할 다른 앱을 선택할 수 있습니다',
    'workflow:special_array_format':
      '특수 배열 형식으로, 검색 결과가 없을 때 빈 배열을 반환합니다.',
    'workflow:start_with': '다음으로 시작함',
    'workflow:tag_filter': '태그 필터',
    'workflow:tag_filter_description':
      '현재 태그, 생성 시간, 컬렉션 ID 필터를 지원하며, 해당 파일을 정확하게 찾아 검색 정확도와 효율을 높일 수 있습니다. 예: 사용자가 “유효기간은 얼마인가요?”라고 묻고, 해당 질문이 주문의 제품 A에 대한 것임이 확인되면 메타데이터 필터로 제품 A 관련 파일만 잠가, 다른 “유효기간”이 포함된 파일에서 검색하는 것을 피할 수 있습니다.',
    'workflow:target_fields_description':
      "대상 필드는 'description'과 'key'로 구성됩니다. 여러 대상 필드를 추출할 수 있습니다.",
    'workflow:template.agent': '도구 호출',
    'workflow:template.agent_intro': 'AI가 도구 호출 여부와 사용할 도구를 자율적으로 결정합니다.',
    'workflow:template.agent_module': '에이전트',
    'workflow:template.agent_module_intro':
      '필요한 도구와 스킬을 연결하여 AI 기반의 자율적인 호출과 계획을 가능하게 합니다',
    'workflow:template.ai_chat': 'AI 대화',
    'workflow:template.ai_chat_intro': 'AI 대형 모델 대화',
    'workflow:template.dataset_search': '데이터셋 검색',
    'workflow:template.dataset_search_intro':
      "'시맨틱 검색'과 '전체 텍스트 검색' 기능을 사용하여 '데이터셋'에서 잠재적으로 관련된 참조 내용을 찾습니다.",
    'workflow:template.forbid_stream': '스트림 모드 금지',
    'workflow:template.forbid_stream_desc': '중첩된 앱 스트림의 출력 모드를 강제로 비활성화합니다',
    'workflow:template.plugin_output': '플러그인 출력',
    'workflow:template.workflow_start': '시작',
    'workflow:text_concatenation': '텍스트 편집기',
    'workflow:text_content_extraction': '텍스트 추출',
    'workflow:text_to_extract': '추출할 텍스트',
    'workflow:these_variables_will_be_input_parameters_for_code_execution':
      '이 변수들은 코드 실행의 입력 파라미터가 됩니다',
    'workflow:tool_call_termination': '도구 호출 중지',
    'workflow:tool_custom_field': '사용자 정의 도구',
    'workflow:tool_raw_response_description': '도구의 원본 응답',
    'workflow:trigger_after_application_completion': '앱이 완전히 완료된 후 트리거됩니다',
    'workflow:update_specified_node_output_or_global_variable':
      '지정된 노드의 출력값을 업데이트하거나 전역 변수를 업데이트할 수 있습니다',
    'workflow:use_user_id': '사용자 ID',
    'workflow:user_question': '사용자 질문',
    'workflow:variable_update': '변수 업데이트',
    'workflow:workflow_builder_version_name': 'AI 생성 버전 {{versionNo}}'
  }
};

/** 工作流模板与配置描述共用轻量词典，避免 CLI 依赖前端全量翻译文件；未知 locale/key 回退英文或原值。 */
export const createTranslator = (locale: string) => {
  const localeResources = workflowTemplateResources[locale] ?? workflowTemplateResources.en;
  return (value: string) => {
    if (!value.includes(':')) return value;
    return localeResources[value] ?? workflowTemplateResources.en[value] ?? value;
  };
};
