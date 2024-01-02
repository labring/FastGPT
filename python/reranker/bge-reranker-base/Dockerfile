FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

# please download the model from https://huggingface.co/BAAI/bge-reranker-base and put it in the same directory as Dockerfile
COPY ./bge-reranker-base ./bge-reranker-base

COPY app.py Dockerfile requirement.txt .

RUN python3 -m pip install -r requirement.txt

ENTRYPOINT python3 app.py
