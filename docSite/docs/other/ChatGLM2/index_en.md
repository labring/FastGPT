# Using ChatGLM2 on FastGPT in 3 Minutes

## Introduction

Fast GPT allows you to quickly call the OpenAI API using your own API KEY and integrates Gpt35, Gpt4, and embedding. You can also build your own knowledge base. However, due to data security concerns, not all data can be handed over to cloud-based large models. So, how can you integrate private models on FastGPT? This article will use Tsinghua's ChatGLM2 as an example to explain how to integrate a private model into FastGPT.

## Introduction to ChatGLM2

ChatGLM2-6B is the second-generation version of the open-source bilingual dialogue model ChatGLM-6B. For specific details, please refer to the project: https://github.com/THUDM/ChatGLM2-6B. Note that ChatGLM2-6B weights are completely open for academic research and, with official written permission, also allow commercial use. This tutorial only introduces one usage method and does not grant any authorization.

## Recommended Configurations

Based on official data, for the same length of 8192, the memory occupation for quantization level FP16 is around 12.8GB, for INT8 is around 8.1GB, and for INT4 is around 5.1GB. Quantization will slightly impact performance but not by much. Hence, the recommended configurations are as follows:
- FP16: Memory >= 16GB, VRAM >= 16GB, Hard Disk Space >= 25GB, launch with the command: `python openai_api.py 16`
- INT8: Memory >= 16GB, VRAM >= 9GB, Hard Disk Space >= 25GB, launch with the command: `python openai_api.py 8`
- INT4: Memory >= 16GB, VRAM >= 6GB, Hard Disk Space >= 25GB, launch with the command: `python openai_api.py 4`

## Environment Setup

- Python 3.8.10
- CUDA 11.8
- Internet access in a censored environment

## Simple Steps

1. Configure the environment based on the environment setup above (refer to relevant guides for this process).
2. Enter the command `pip install -r requirements.txt` in the command line.
3. Open the Python file you want to start, and configure the token in line 76 of the code. This token is an additional layer of verification to prevent unauthorized access to the interface.
4. Run `python openai_api.py 16` where the number is chosen based on the previously mentioned configurations.

Wait for the model to download and load. If any errors occur, seek help from relevant sources.

The address to access should be displayed upon successful launch:
![Image](image.png)
The address such as http://0.0.0.0:6006 is the connection address.

Now, return to the .env.local file and configure the address as follows:

```
OPENAI_BASE_URL=http://127.0.0.1:6006/v1
OPENAIKEY=sk-aaabbbcccdddeeefffggghhhiiijjjkkk // This is the token you configured in the code
```

You can fill in any value for OPENAIKEY.

This way, you have successfully integrated ChatGLM2.