---
sidebar_position: 2
---

# Global Variables

## Features

- Only one can be added
- Manually configured
- Affects other modules
- Can be used as user prompts

## Description

You can set up some questions before the conversation to have the user input or select options. The results of the user's input/selection will be injected into other modules. Currently, it will only be injected into string-type data (corresponding to the input with a blue circle).

As shown in the image below, two variables are defined: "Target Language" and "Dropdown Test" (ignored).

Before the conversation, users will be prompted to fill in the "Target Language." With user prompts, you can construct a simple translation robot. The key of "Target Language," which is "language," is written into the constraints of the "AI Conversation" module.

![](./imgs/variable.png)

From the complete conversation record, you can see that the actual constraint changes from "Translate my question directly into {{language}}" to "Translate my question directly into English" because {{language}} has been replaced by the variable.

![](./imgs/variable2.png)

## System-level Variables

In addition to user-defined variables, there are also some system variables:

cTime: Current time, for example, 2023/3/3 20:22