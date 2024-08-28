FROM ubuntu:22.04
  
ENV DEBIAN_FRONTEND noninteractive

ENV LANG C.UTF-8

RUN apt-get update && apt-get install apt-utils python3 -y python3-pip -y docker.io -y ffmpeg -y opencc -y
#RUN apt-get update && apt-get install apt-utils python3 -y python3-pip -y docker.io -y vim -y libcudart11.0 libcublaslt11 -y ffmpeg -y opencc -y

RUN mkdir -p /root/.pip

ADD pip.conf /root/.pip/

COPY whisper /root/whisper

USER root

RUN cd /root/whisper && pip3 install -r requirements.txt

RUN pip3 install -U openai-whisper

RUN pip3 install git+https://github.com/openai/whisper.git

RUN pip3 install --upgrade --no-deps --force-reinstall git+https://github.com/openai/whisper.git

#RUN pip3 install setuptools-rust

RUN pip3 install fastapi

RUN pip3 install python-multipart

RUN pip3 install uvicorn 

#COPY medium.pt /root/.cache/whisper/medium.pt

COPY api.py /root/api.py

WORKDIR /root

#CMD ["tail", "-f", "/dev/null"]

CMD ["python3", "api.py"]
