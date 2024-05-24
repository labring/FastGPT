FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

# please download the model from https://huggingface.co/BAAI/bge-reranker-large and put it in the same directory as Dockerfile
COPY ./bge-reranker-large ./bge-reranker-large

COPY requirements.txt .

RUN python3 -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY app.py Dockerfile .

ENTRYPOINT python3 app.py
