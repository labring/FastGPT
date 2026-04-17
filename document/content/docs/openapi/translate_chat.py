#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# Read the Chinese file
with open('chat.mdx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Translation mappings for common terms
translations = {
    '对话接口': 'Chat API',
    '如何获取': 'How to Get',
    '可在应用详情的路径里获取': 'You can find the AppId in your application details URL',
    '发起对话': 'Start a Conversation',
    '该接口的 API Key 需使用': 'This API requires',
    '应用特定的 key': 'an application-specific API key',
    '否则会报错': 'or it will return an error',
    '有些包调用时': 'Some packages require',
    '需要添加': 'adding',
    '路径，有些不需要，如果出现404情况，可补充': 'to the path. If you get a 404 error, try adding',
    '重试': 'and retry',
    '请求对话 Agent 和工作流': 'Request Chat Agent and Workflow',
    '对话接口兼容': 'chat API is compatible with',
    '的接口！如果你的项目使用的是标准的': "interface! If you're using the standard",
    '官方接口，可以直接通过修改': 'official API, you can access FastGPT by simply changing the',
    '来访问 FastGpt 应用，不过需要注意下面几个规则：': 'However, note these rules:',
    '传入的': 'Parameters like',
    '等参数字段均无效，这些字段由编排决定，不会根据 API 参数改变。': 'are ignored. These values are determined by your workflow configuration.',
    '不会返回实际消耗': "Won't return actual",
    '值，如果需要，可以设置': 'consumed. If needed, set',
    '，并手动计算': 'and manually calculate',
    '里的': 'from',
    '值。': 'values.',
    '请求': 'Request',
    '基础请求示例': 'Basic Request Example',
    '图片/文件请求示例': 'Image/File Request Example',
    '参数说明': 'Parameters',
    '仅': 'Only',
    '有部分区别，其他参数一致。': 'differs slightly; other parameters are the same.',
    '目前不支持上传文件，需上传到自己的对象存储中，获取对应的文件链接。': 'Direct file uploads are not supported. Upload files to your object storage and provide the URL.',
    '图片链接': 'Image URL',
    '文件名': 'Filename',
    '文档链接，支持': 'Document URL. Supports',
    '为时（不传入），不使用': 'When empty (not provided), FastGPT context is disabled. Context is built entirely from',
    '提供的上下文功能，完全通过传入的': 'provided.',
    '构建上下文。': '',
    '为': 'When set to a',
    '非空字符串': 'non-empty string',
    '时，意味着使用': ', uses',
    '进行对话，自动从': 'for the conversation. Automatically fetches history from the FastGPT database and uses the last',
    '数据库取历史记录，并使用': 'message as the user question. Other messages are ignored. Ensure',
    '数组最后一个内容作为用户问题，其余': 'is unique and under 250 characters (typically your system',
    '会被忽略。请自行确保': "'s conversation ID).",
    '唯一，长度小于250，通常可以是自己系统的对话框ID。': '',
    '结构与': 'Structure matches',
    '模式一致。': 'chat format.',
    '如果传入，则会将该值作为本次对话的响应消息的 ID，FastGPT会自动将该 ID 存入数据库。请确保，在当前': 'If provided, this value will be used as the response message ID. FastGPT will store it in the database. Ensure',
    '下，': 'is unique within the current',
    '是唯一的。': '.',
    '是否返回中间值（模块状态，响应的完整结果等），': 'Whether to return intermediate values (module status, complete response data, etc.).',
    '模式': 'mode',
    '下会通过': 'uses',
    '进行区分，': 'to distinguish events.',
    '非': 'Non-',
    '结果保存在': 'results are in',
    '中。': '.',
    '模块变量，一个对象，会替换模块中，输入框内容里的': 'Module variables (object). Replaces',
    '响应': 'Response',
    '响应示例': 'Response Example',
    '取值：': 'Event values:',
    '返回给客户端的文本（最终会算作回答）': 'Text returned to client (counted as answer)',
    '指定回复返回给客户端的文本（最终会算作回答）': 'Specified reply text returned to client (counted as answer)',
    '执行工具': 'Tool execution',
    '工具参数': 'Tool parameters',
    '工具返回': 'Tool response',
    '运行到的节点状态': 'Node status',
    '节点完整响应': 'Complete node response',
    '更新变量': 'Update variables',
    '报错': 'Error',
}

# Start translation
output = []
for line in lines:
    # Keep code blocks and special syntax as-is
    if line.strip().startswith('```') or line.strip().startswith('curl') or line.strip().startswith('{') or line.strip().startswith('}') or line.strip().startswith('"') or line.strip().startswith('event:') or line.strip().startswith('data:') or '|' in line:
        output.append(line)
        continue
    
    # Translate frontmatter
    if line.strip().startswith('title:'):
        output.append('title: Chat API\n')
        continue
    if line.strip().startswith('description:'):
        output.append('description: FastGPT OpenAPI Chat Interface\n')
        continue
    
    # Keep MDX components as-is
    if '<Tab' in line or '</Tab>' in line or '<Tabs' in line or '</Tabs>' in line or '<div>' in line or '</div>' in line:
        # But translate the values
        translated = line
        if 'items={[' in line:
            translated = translated.replace('基础请求示例', 'Basic Request Example')
            translated = translated.replace('图片/文件请求示例', 'Image/File Request Example')
            translated = translated.replace('参数说明', 'Parameters')
            translated = translated.replace('响应示例', 'Response Example')
            translated = translated.replace('请求示例', 'Request Example')
            translated = translated.replace('输出获取', 'Output Retrieval')
            translated = translated.replace('用户选择', 'User Selection')
            translated = translated.replace('表单输入', 'Form Input')
            translated = translated.replace('event值', 'Event Values')
        if 'value=' in line:
            translated = translated.replace('基础请求示例', 'Basic Request Example')
            translated = translated.replace('图片/文件请求示例', 'Image/File Request Example')
            translated = translated.replace('参数说明', 'Parameters')
            translated = translated.replace('响应示例', 'Response Example')
            translated = translated.replace('请求示例', 'Request Example')
            translated = translated.replace('输出获取', 'Output Retrieval')
            translated = translated.replace('用户选择', 'User Selection')
            translated = translated.replace('表单输入', 'Form Input')
            translated = translated.replace('event值', 'Event Values')
            translated = translated.replace('detail=false,stream=false 响应', 'detail=false, stream=false Response')
            translated = translated.replace('detail=false,stream=true 响应', 'detail=false, stream=true Response')
            translated = translated.replace('detail=true,stream=false 响应', 'detail=true, stream=false Response')
            translated = translated.replace('detail=true,stream=true 响应', 'detail=true, stream=true Response')
        output.append(translated)
        continue
    
    # Keep image paths
    if '![' in line:
        output.append(line)
        continue
    
    # Keep comments
    if '{/*' in line:
        output.append(line)
        continue
    
    # Translate headers
    if line.startswith('#'):
        if '如何获取 AppId' in line:
            output.append('# How to Get AppId\n')
        elif '发起对话' in line:
            output.append('# Start a Conversation\n')
        elif '请求对话 Agent 和工作流' in line:
            output.append('## Request Chat Agent and Workflow\n')
        elif '请求' in line and '###' in line:
            output.append('### Request\n')
        elif '响应' in line and '###' in line:
            output.append('### Response\n')
        elif '交互节点响应' in line:
            output.append('### Interactive Node Response\n')
        elif '交互节点继续运行' in line:
            output.append('### Continue Interactive Node\n')
        elif '请求插件' in line:
            output.append('## Request Plugin\n')
        elif '请求示例' in line:
            output.append('### Request Example\n')
        elif '响应示例' in line:
            output.append('### Response Example\n')
        elif '对话 CRUD' in line:
            output.append('# Chat CRUD\n')
        elif '历史记录' in line:
            output.append('## History\n')
        elif '获取某个应用历史记录' in line:
            output.append('### Get Application History\n')
        elif '修改某个对话的标题' in line:
            output.append('### Update Chat Title\n')
        elif '置顶 / 取消置顶' in line:
            output.append('### Pin / Unpin\n')
        elif '删除某个历史记录' in line:
            output.append('### Delete History\n')
        elif '清空所有历史记录' in line:
            output.append('### Clear All History\n')
        elif '对话记录' in line:
            output.append('## Chat Records\n')
        elif '获取单个对话初始化信息' in line:
            output.append('### Get Chat Initialization Info\n')
        elif '获取对话记录列表' in line:
            output.append('### Get Chat Record List\n')
        elif '获取单个对话记录运行详情' in line:
            output.append('### Get Chat Record Details\n')
        elif '删除对话记录' in line:
            output.append('### Delete Chat Record\n')
        elif '点赞 / 取消点赞' in line:
            output.append('### Like / Unlike\n')
        elif '点踩 / 取消点踩' in line:
            output.append('### Dislike / Remove Dislike\n')
        elif '猜你想问' in line:
            output.append('## Question Suggestions\n')
        else:
            output.append(line)
        continue
    
    # Translate bullet points and regular text
    translated = line
    
    # Common translations
    translated = translated.replace('该接口的 API Key 需使用`应用特定的 key`，否则会报错。', 'This API requires an application-specific API key, or it will return an error.')
    translated = translated.replace('有些包调用时，`BaseUrl`需要添加`v1`路径，有些不需要，如果出现404情况，可补充`v1`重试。', 'Some packages require adding `v1` to the `BaseUrl`. If you get a 404 error, try adding `v1` and retry.')
    translated = translated.replace('可在应用详情的路径里获取 AppId。', 'You can find the AppId in your application details URL.')
    translated = translated.replace('`v1`对话接口兼容`GPT`的接口！如果你的项目使用的是标准的`GPT`官方接口，可以直接通过修改`BaseUrl`和 `Authorization`来访问 FastGpt 应用，不过需要注意下面几个规则：', 'The `v1` chat API is compatible with the `GPT` interface! If you\'re using the standard `GPT` official API, you can access FastGPT by simply changing the `BaseUrl` and `Authorization`. However, note these rules:')
    translated = translated.replace('传入的`model`，`temperature`等参数字段均无效，这些字段由编排决定，不会根据 API 参数改变。', 'Parameters like `model` and `temperature` are ignored. These values are determined by your workflow configuration.')
    translated = translated.replace('不会返回实际消耗`Token`值，如果需要，可以设置`detail=true`，并手动计算 `responseData` 里的`tokens`值。', "Won't return actual `Token` consumed. If needed, set `detail=true` and manually calculate `tokens` from `responseData`.")
    translated = translated.replace('仅`messages`有部分区别，其他参数一致。', 'Only `messages` differs slightly; other parameters are the same.')
    translated = translated.replace('目前不支持上传文件，需上传到自己的对象存储中，获取对应的文件链接。', 'Direct file uploads are not supported. Upload files to your object storage and provide the URL.')
    translated = translated.replace('图片链接', 'Image URL')
    translated = translated.replace('文件名', 'Filename')
    translated = translated.replace('文档链接，支持 txt md html word pdf ppt csv excel', 'Document URL. Supports txt, md, html, word, pdf, ppt, csv, excel')
    translated = translated.replace('入参：', '**Request Parameters:**')
    translated = translated.replace('出参：', '**Response Parameters:**')
    translated = translated.replace('应用Id', 'Application ID')
    translated = translated.replace('应用 Id', 'Application ID')
    translated = translated.replace('历史记录 Id', 'History ID')
    translated = translated.replace('对话 Id', 'Chat ID')
    translated = translated.replace('对话记录 Id', 'Chat Record ID')
    translated = translated.replace('自定义对话名', 'Custom chat title')
    translated = translated.replace('是否置顶，ture 置顶，false 取消置顶', 'Whether to pin. true = pin, false = unpin')
    translated = translated.replace('偏移量，即从第几条数据开始取', 'Offset (starting position)')
    translated = translated.replace('记录数量', 'Number of records')
    translated = translated.replace('对话源。source=api，表示获取通过 API 创建的对话（不会获取到页面上的对话记录）', 'Chat source. source=api means get API-created chats only (excludes web UI chats)')
    translated = translated.replace('仅会情况通过 API Key 创建的对话历史记录，不会清空在线使用、分享链接等其他来源的对话历史记录。', 'Only clears chat history created via API Key. Does not clear history from web UI, share links, or other sources.')
    translated = translated.replace('指的是某个 chatId 下的对话记录操作。', 'Operations on chat records under a specific chatId.')
    translated = translated.replace('偏移量', 'Offset')
    translated = translated.replace('是否读取自定义反馈（可选）', 'Whether to load custom feedbacks (optional)')
    translated = translated.replace('用户点赞时的信息（可选），取消点赞时不填此参数即可', 'User feedback when liking (optional). Omit to unlike.')
    translated = translated.replace('用户点踩时的信息（可选），取消点踩时不填此参数即可', 'User feedback when disliking (optional). Omit to remove dislike.')
    translated = translated.replace('新版猜你想问，必须包含 appId 和 chatId 的参数才可以进行使用。会自动根据 chatId 去拉取最近 6 轮对话记录作为上下文来引导回答。', 'The new question suggestion feature requires both appId and chatId parameters. It automatically fetches the last 6 conversation turns from chatId as context.')
    translated = translated.replace('参数名', 'Parameter')
    translated = translated.replace('类型', 'Type')
    translated = translated.replace('必填', 'Required')
    translated = translated.replace('说明', 'Description')
    translated = translated.replace('自定义配置，不传的话，则会根据 appId，取最新发布版本的配置', 'Custom configuration. If not provided, uses the latest published version config from appId')
    translated = translated.replace('以下接口可使用任意`API Key`调用。', 'The following APIs can be called with any `API Key`.')
    translated = translated.replace('以上版本才能使用', 'and above')
    translated = translated.replace('重要字段', '**Important Fields**')
    translated = translated.replace('指一个应用下，某一个对话窗口的 ID', 'The ID of a conversation window under an application')
    translated = translated.replace('指一个对话窗口下，某一个对话记录的 ID', 'The ID of a chat record under a conversation window')
    translated = translated.replace('如果工作流中包含交互节点，依然是调用该 API 接口，需要设置`detail=true`，并可以从`event=interactive`的数据中获取交互节点的配置信息。如果是`stream=false`，则可以从 choice 中获取`type=interactive`的元素，获取交互节点的选择信息。', 'If your workflow contains interactive nodes, still call this API with `detail=true`. Get interactive node config from `event=interactive` data. For `stream=false`, find `type=interactive` elements in choices.')
    translated = translated.replace('当你调用一个带交互节点的工作流时，如果工作流遇到了交互节点，那么会直接返回，你可以得到下面的信息：', 'When calling a workflow with interactive nodes, if an interactive node is encountered, it returns immediately with this info:')
    translated = translated.replace('紧接着上一节，当你接收到交互节点信息后，可以根据这些数据进行 UI 渲染，引导用户输入或选择相关信息。然后需要再次发起对话，来继续工作流。调用的接口与仍是该接口，你需要按以下格式来发起请求：', 'After receiving interactive node info, render your UI to guide user input or selection. Then call this API again to continue the workflow. Use this format:')
    translated = translated.replace('对于用户选择，你只需要直接传递一个选择的结果给 messages 即可。', 'For user selection, simply pass the selected value to messages.')
    translated = translated.replace('表单输入稍微麻烦一点，需要将输入的内容，以对象形式并序列化成字符串，作为`messages`的值。对象的 key 对应表单的 key，value 为用户输入的值。务必确保`chatId`是一致的。', 'Form input is slightly more complex. Serialize the input as a JSON string for `messages`. Object keys match form keys, values are user inputs. Ensure `chatId` is consistent.')
    translated = translated.replace('插件的接口与对话接口一致，仅请求参数略有区别，有以下规定：', 'Plugin API is identical to chat API, with slight parameter differences:')
    translated = translated.replace('调用插件类型的应用时，接口默认为`detail`模式。', 'When calling plugin-type applications, the API defaults to `detail` mode.')
    translated = translated.replace('无需传入 `chatId`，因为插件只能运行一轮。', 'No need to pass `chatId` since plugins run only once.')
    translated = translated.replace('无需传入`messages`。', 'No need to pass `messages`.')
    translated = translated.replace('通过传递`variables`来代表插件的输入。', 'Pass `variables` to represent plugin inputs.')
    translated = translated.replace('通过获取`pluginData`来获取插件输出。', 'Get plugin outputs from `pluginData`.')
    translated = translated.replace('插件的输出可以通过查找`responseData`中, `moduleType=pluginOutput`的元素，其`pluginOutput`是插件的输出。', 'Find plugin output by locating `moduleType=pluginOutput` in `responseData`. Its `pluginOutput` contains the output.')
    translated = translated.replace('流输出，仍可以通过`choices`进行获取。', 'Stream output is still available via `choices`.')
    translated = translated.replace('插件的输出可以通过获取`event=flowResponses`中的字符串，并将其反序列化后得到一个数组。同样的，查找 `moduleType=pluginOutput`的元素，其`pluginOutput`是插件的输出。', 'Get plugin output by deserializing the `event=flowResponses` string into an array. Find `moduleType=pluginOutput` element; its `pluginOutput` contains the output.')
    translated = translated.replace('流输出，仍和对话接口一样获取。', 'Stream output works the same as chat API.')
    translated = translated.replace('后新版接口', 'New API (version')
    
    # Handle parameter descriptions with dashes
    if translated.strip().startswith('- '):
        # Keep as-is if it's already translated or contains code
        if '`' in translated or 'ID' in translated or 'URL' in translated:
            output.append(translated)
            continue
        
        # Translate common parameter patterns
        translated = translated.replace('- appId:', '- appId:')
        translated = translated.replace('- chatId:', '- chatId:')
        translated = translated.replace('- dataId:', '- dataId:')
        translated = translated.replace('- offset:', '- offset:')
        translated = translated.replace('- pageSize:', '- pageSize:')
        translated = translated.replace('- source:', '- source:')
        translated = translated.replace('- customTitle:', '- customTitle:')
        translated = translated.replace('- top:', '- top:')
        translated = translated.replace('- contentId:', '- contentId:')
        translated = translated.replace('- userGoodFeedback:', '- userGoodFeedback:')
        translated = translated.replace('- userBadFeedback:', '- userBadFeedback:')
        translated = translated.replace('- loadCustomFeedbacks:', '- loadCustomFeedbacks:')
        translated = translated.replace('- questionGuide:', '- questionGuide:')
        translated = translated.replace('- dateStart:', '- dateStart:')
        translated = translated.replace('- dateEnd:', '- dateEnd:')
        translated = translated.replace('- userTimespan:', '- userTimespan:')
        translated = translated.replace('- chatTimespan:', '- chatTimespan:')
        translated = translated.replace('- appTimespan:', '- appTimespan:')
        translated = translated.replace('- userData:', '- userData:')
        translated = translated.replace('- chatData:', '- chatData:')
        translated = translated.replace('- appData:', '- appData:')
        translated = translated.replace('- timestamp:', '- timestamp:')
        translated = translated.replace('- summary:', '- summary:')
        translated = translated.replace('- userCount:', '- userCount:')
        translated = translated.replace('- newUserCount:', '- newUserCount:')
        translated = translated.replace('- retentionUserCount:', '- retentionUserCount:')
        translated = translated.replace('- points:', '- points:')
        translated = translated.replace('- sourceCountMap:', '- sourceCountMap:')
        translated = translated.replace('- chatItemCount:', '- chatItemCount:')
        translated = translated.replace('- chatCount', '- chatCount')
        translated = translated.replace('- errorCount', '- errorCount')
        translated = translated.replace('- goodFeedBackCount', '- goodFeedBackCount')
        translated = translated.replace('- badFeedBackCount', '- badFeedBackCount:')
        translated = translated.replace('- totalResponseTime', '- totalResponseTime')
        
        # Translate descriptions
        translated = translated.replace('开始时间', 'Start time')
        translated = translated.replace('结束时间', 'End time')
        translated = translated.replace('日志来源', 'Log source')
        translated = translated.replace('用户留存偏移量', 'User retention offset')
        translated = translated.replace('用户数据时间跨度', 'User data timespan')
        translated = translated.replace('对话数据时间跨度', 'Chat data timespan')
        translated = translated.replace('应用数据时间跨度', 'Application data timespan')
        translated = translated.replace('用户数据数组', 'User data array')
        translated = translated.replace('对话数据数组', 'Chat data array')
        translated = translated.replace('应用数据数组', 'Application data array')
        translated = translated.replace('时间戳', 'Timestamp')
        translated = translated.replace('汇总数据对象', 'Summary data object')
        translated = translated.replace('活跃用户数量', 'Active user count')
        translated = translated.replace('新用户数量', 'New user count')
        translated = translated.replace('留存用户数量', 'Retained user count')
        translated = translated.replace('总积分消耗', 'Total points consumed')
        translated = translated.replace('各来源用户数量', 'User count by source')
        translated = translated.replace('对话次数', 'Chat message count')
        translated = translated.replace('会话次数', 'Session count')
        translated = translated.replace('错误对话次数', 'Error count')
        translated = translated.replace('好评反馈数量', 'Positive feedback count')
        translated = translated.replace('差评反馈数量', 'Negative feedback count')
        translated = translated.replace('总响应时间', 'Total response time')
    
    output.append(translated)

# Write the translated file
with open('chat.en.mdx', 'w', encoding='utf-8') as f:
    f.writelines(output)

print("Translation complete!")
