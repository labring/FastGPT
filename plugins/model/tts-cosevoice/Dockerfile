FROM dockerhub.icu/pytorch/pytorch:2.1.0-cuda11.8-cudnn8-runtime
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /opt/CosyVoice

RUN chmod 777 /tmp && sed -i 's@//.*archive.ubuntu.com@//mirrors.ustc.edu.cn@g' /etc/apt/sources.list && apt-get update -y && apt-get -y install git unzip git-lfs
RUN git lfs install && git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
# here we use python==3.10 because we cannot find an image which have both python3.8 and torch2.0.1-cu118 installed
COPY ./requirements.txt CosyVoice
RUN cd CosyVoice && pip3 install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
RUN cd CosyVoice/runtime/python/grpc && python3 -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. cosyvoice.proto
COPY fastapi/server.py CosyVoice/runtime/python/fastapi/
