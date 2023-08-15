# Content Extraction

- Repeatable addition
- External input
- Manual configuration
- Trigger execution
- function_call module
- Core module

![](./imgs/extract1.png)

## Functionality

Extract structured data from text, usually in conjunction with the HTTP module for extension. It can also perform direct extraction operations, such as translation.

## Parameter Description

### Extraction Requirement Description

As the name suggests, give the model a target and specify which content needs to be extracted.

**Example 1**

> You are a lab reservation assistant, extract the name, appointment time, and lab number from the conversation. Current time is {{cTime}}.

**Example 2**

> You are a Google search assistant, extract the search keywords from the conversation.

**Example 3**

> Translate my question directly into English, do not answer the question.

### History Records

Usually, some history records are needed to extract user questions more completely. For example, in the figure above, the name, time, and lab name need to be provided in advance. The user may only provide the time and lab name at the beginning, without giving their own name. After a round of missing prompts, the user enters their name. At this time, it is necessary to combine the previous record to extract all 3 contents completely.

### Target Fields

The target fields correspond to the extracted results. From the figure above, it can be seen that for each additional field, there will be a corresponding output.
key: The unique identifier of the field, cannot be repeated!
Field Description: Describes what the field is about, such as name, time, search term, etc.
Required: Whether to force the model to extract the field, it may be extracted as an empty string.

## Output Introduction

- Field fully extracted: Indicates that the user's question contains all the content that needs to be extracted.
- Missing extracted fields: The opposite of "Field fully extracted", triggered when there are missing extracted fields.
- Complete extraction result: A JSON string containing the extraction results of all fields.
- Extraction results of target fields: All types are strings.
