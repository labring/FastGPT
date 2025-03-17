#FROM yiminger/sensevoice:latest
FROM pytorch/pytorch:2.1.2-cuda12.1-cudnn8-runtime

COPY ./app /app

WORKDIR /app

#COPY main.py /app/main.py

RUN pip3 install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

CMD ["python3","main.py"]
