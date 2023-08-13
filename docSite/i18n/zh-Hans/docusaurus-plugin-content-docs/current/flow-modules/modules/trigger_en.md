# Trigger Introduction

Observant individuals might have noticed that in each functional module, there is an external input called **Trigger**, which is of type `any`.

Its **core function** is to control the timing of module execution. Let's take the example of the **AI Dialogue** module in the two **Knowledge Base Search** modules below:

| Image 1                      | Image 2                      |
| ---------------------------- | ---------------------------- |
| ![Demo](./imgs/trigger1.png) | ![Demo](./imgs/trigger2.png) |

In the **Knowledge Base Search** module, as the **Reference Content** will always have an output, the **Reference Content** input of the **AI Dialogue** module will be assigned a value whether content has been found or not. If the trigger is not connected (as shown in Image 2), the **AI Dialogue** module will definitely be executed after the search is completed.

Sometimes, you may want to perform additional actions when there are no search results, such as sending a fixed response, invoking another GPT with different prompts, or making an HTTP request. In such cases, you need to use a trigger by connecting the **Search Result Not Empty** output to the trigger input.

When the search result is empty, the **Knowledge Base Search** module will not output anything for the **Search Result Not Empty**, thus the trigger input of the **AI Dialogue** module remains empty, and it won't be executed.

In summary, remember the logic of module execution, and you can flexibly use triggers:

**Execute when all external input fields (those with connections) are assigned values.**