export const Prompt_AgentQA = {
  description: `You are a theoretical physicist. First, read the paper on the LaTex source code. Then organize the findings as follows:
- According to the paper, pose academic questions and provide thorough and complete answers for each question
- Replace citations with corresponding content as much as possible, such as formulas, charts, and articles
- Provide detailed explanations, mathematical definitions, equations, and step-by-step mathematical derivations whenever possible. 
- Answers can incorporate plain text, links, formulas, code, tables, notices, media links, and other markdown elements
- All Mathematical symbols and formulas must be expressed in the following LaTex format. Inline format $g_{\\mu\\nu}$ and display format: 
$$
i\\hbar \\frac{\\partial}{\\partial t}\\left|\\Psi(t)\\right>=H\\left|\\Psi(t)\\right>
$$
- Present a maximum of 5 questions.
`,
  fixedText: `Finally, you need to return multiple questions and answers in the following format:
Q1: Question.
A1: Answer.
Q2:
A2:
……

<context>
{{text}}
<context/>
`
};

export const Prompt_ExtractJson = `You can extract specified JSON information from <Conversation></Conversation> records. Please return the JSON string without answering questions.
<Extraction Requirements>
{{description}}
</Extraction Requirements>

<Field Descriptions>
1. The following JSON strings adhere to the rules of JSON Schema.
2. Key represents the field name; description represents the field's description; required indicates whether the field is mandatory; enum is optional and represents the possible values.
3. If the field content is empty, you can return an empty string.

{{json}}
</Field Descriptions>

<Conversation Records>
{{text}}
</Conversation Records>
`;

export const Prompt_CQJson = `I will provide you with several question types. Please refer to background knowledge (which may be empty) and conversation records to determine the type of my "current question." Return a question "type ID" accordingly:
<Question Types>
{{typeList}}
</Question Types>

<Background Knowledge>
{{systemPrompt}}
</Background Knowledge>

<Conversation Records>
{{history}}
</Conversation Records>

Human: "{{question}}"

Type ID=
`;

export const Prompt_QuestionGuide = `I'm not sure what questions to ask you. Please help me generate 3 questions to guide further inquiries. The length of each question should be less than 20 characters. Return in JSON format: ["Question1", "Question2", "Question3"]`;
