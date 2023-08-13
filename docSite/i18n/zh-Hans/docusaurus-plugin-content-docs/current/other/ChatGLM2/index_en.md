# Using GLM on FastGPT in 3 Minutes
## Introduction
Fast GPT allows you to quickly call the openai API using your own API KEY and integrates Gpt35, Gpt4, and embedding. You can build your own knowledge base. However, considering data security, we can't just entrust all data to cloud-based large models. So how do you integrate private models into FastGPT? This article uses ChatGLM2 from Tsinghua University as an example to explain how to integrate private models into FastGPT.

## ChatGLM2 Introduction
ChatGLM2-6B is the second generation version of the open-source bilingual dialogue model ChatGLM-6B, which supports both Chinese and English. For more details, please refer to the project: https://github.com/THUDM/ChatGLM2-6B
Note that the ChatGLM2-6B weights are fully open for academic research and also allow commercial use with official written permission. This tutorial only introduces one way of usage and does not provide any authorization.

## Recommended Configurations
Based on official data, generating a sequence of length 8192 with quantization level FP16 requires around 12.8GB of VRAM, INT8 requires around 8.1GB, and INT4 requires around 5.1GB. Quantization slightly affects performance but not significantly.
Therefore, the recommended configurations are as follows:
- fp16: RAM >= 16GB, VRAM >= 16GB, Disk space >= 25GB, launch with the command `python openai_api.py 16`
- int8: RAM >= 16GB, VRAM >= 9GB, Disk space >= 25GB, launch with the command `python openai_api.py 8`
- int4: RAM >= 16GB, VRAM >= 6GB, Disk space >= 25GB, launch with the command `python openai_api.py 4`

## Environment Setup
- Python 3.8.10
- CUDA 11.8
- Internet access (scientific VPN)

## Simple Steps
1. Configure the environment according to the setup described above. Refer to relevant guides for configuring your environment.
2. Install the required packages by running `pip install -r requirements.txt` in the command line.
3. Open the Python file you need to run, and configure the token on line 76 of the code. This token provides an additional layer of verification to prevent unauthorized access to the API.
4. Run the command `python openai_api.py 16` (or the appropriate number based on your configuration) to start the model.
5. Wait for the model to download and load. If any errors occur, refer to the GPT documentation for assistance.
6. Once the model is successfully loaded, the address will be displayed, such as `http://0.0.0.0:6006`.

Now, go back to the `.env.local` file and configure the address as follows:
```
OPENAI_BASE_URL=http://127.0.0.1:6006/v1
OPENAIKEY=sk-aaabbbcccdddeeefffggghhhiiijjjkkk // This is the token you configured in the code
```
You can fill in any value for `OPENAIKEY`.

By following these steps, you have successfully integrated ChatGLM2 into FastGPT.