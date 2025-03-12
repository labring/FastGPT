export const Prompt_AgentQA = {
  description: `As an expert in the fields of physics, mathematics and computer science, you uniquely synthesizes the profound intuition of a physicist, the rigorous logic of a mathematician, and the computational and pratical thinking of a computer scientist.
  
  The input <Context></Context> tag contains a text passage. Study and analyze it, and organize your learning results:
- Raise questions and provide answers for each question.
- Answers should be detailed and complete, preserving original descriptions when possible, with appropriate extensions.
- Answers can include plain text, links, code, tables, formulas, media links, and other Markdown elements.
- Raise at most 50 questions.
- Generate questions and answers in the same language as the source text.
`,
  fixedText: `Please organize your learning results in the following format:
<Context>
Text
</Context>
Q1: Question.
A1: Answer.
Q2:
A2:

------

Let's begin!

<Context>
{{text}}
</Context>
`
};

export const Prompt_ExtractJson = `You can extract specific JSON information from <Conversation></Conversation>. You only need to return the JSON string without answering questions.
<Extraction Requirements>
{{description}}
</Extraction Requirements>

<Extraction Rules>
- The JSON string to be extracted must conform to JsonSchema rules.
- "type" represents data type; "key" represents field name; "description" represents field description; "enum" represents enumerated values, indicating possible values.
- If there is no extractable content, ignore that field.
</Extraction Rules>

<JsonSchema>
{{json}}
</JsonSchema>

<Conversation>
{{text}}
</Conversation>

Extracted JSON string:`;

export const Prompt_CQJson = `Please help me perform a "question classification" task, categorizing the question into one of the following types:

"""
{{typeList}}
"""

## Background Knowledge
{{systemPrompt}}

## Conversation History
{{history}}

## Start Task

Now, let's begin classification. I will give you a "question", please combine the background knowledge and conversation history to classify the question into the corresponding type and return the type ID.

Question: "{{question}}"
Type ID=
`;

export const PROMPT_QUESTION_GUIDE = `You are an AI assistant tasked with predicting the user's next question based on the conversation history. Your goal is to generate 3 potential questions that will guide the user to continue the conversation. When generating these questions, use the same language as the user's last question in the conversation history.

Analyze the conversation history provided to you and use it as context to generate relevant and engaging follow-up questions. Your predictions should be logical extensions of the current topic or related areas that the user might be interested in exploring further.

Remember to maintain consistency in tone and style with the existing conversation while providing diverse options for the user to choose from. Your goal is to keep the conversation flowing naturally and help the user delve deeper into the subject matter or explore related topics.`;
export const PROMPT_QUESTION_GUIDE_FOOTER = `Please strictly follow the format rules: \nReturn questions in JSON format: ['Question 1', 'Question 2', 'Question 3']. Your output: `;
