#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
@Time: 2023/11/7 22:45
@Author: zhidong
@File: reranker.py
@Desc: 
"""
import os
import numpy as np
import logging
import uvicorn
import datetime
from fastapi import FastAPI, Security, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from FlagEmbedding import FlagReranker
from pydantic import Field, BaseModel, validator
from typing import Optional, List

def response(code, msg, data=None):
    time = str(datetime.datetime.now())
    if data is None:
        data = []
    result = {
        "code": code,
        "message": msg,
        "data": data,
        "time": time
    }
    return result

def success(data=None, msg=''):
    return 


class Inputs(BaseModel):
    id: str
    text: Optional[str]


class QADocs(BaseModel):
    query: Optional[str]
    inputs: Optional[List[Inputs]]


class Singleton(type):
    def __call__(cls, *args, **kwargs):
        if not hasattr(cls, '_instance'):
            cls._instance = super().__call__(*args, **kwargs)
        return cls._instance


RERANK_MODEL_PATH = os.path.join(os.path.dirname(__file__), "bge-reranker-base")

class Reranker(metaclass=Singleton):
    def __init__(self, model_path):
        self.reranker = FlagReranker(model_path,
                                     use_fp16=False)

    def compute_score(self, pairs: List[List[str]]):
        if len(pairs) > 0:
            result = self.reranker.compute_score(pairs)
            if isinstance(result, float):
                result = [result]
            return result
        else:
            return None


class Chat(object):
    def __init__(self, rerank_model_path: str = RERANK_MODEL_PATH):
        self.reranker = Reranker(rerank_model_path)

    def fit_query_answer_rerank(self, query_docs: QADocs) -> List:
        if query_docs is None or len(query_docs.inputs) == 0:
            return []
        new_docs = []
        pair = []
        for answer in query_docs.inputs:
            pair.append([query_docs.query, answer.text])
        scores = self.reranker.compute_score(pair)
        for index, score in enumerate(scores):
            new_docs.append({"id": query_docs.inputs[index].id, "score": 1 / (1 + np.exp(-score))})
        new_docs = list(sorted(new_docs, key=lambda x: x["score"], reverse=True))
        return new_docs

app = FastAPI()
security = HTTPBearer()
env_bearer_token = 'ACCESS_TOKEN'

@app.post('/api/v1/rerank')
async def handle_post_request(docs: QADocs, credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    if env_bearer_token is not None and token != env_bearer_token:
        raise HTTPException(status_code=401, detail="Invalid token")
    chat = Chat()
    qa_docs_with_rerank = chat.fit_query_answer_rerank(docs)
    return response(200, msg="重排成功", data=qa_docs_with_rerank)

if __name__ == "__main__":
    token = os.getenv("ACCESS_TOKEN")
    if token is not None:
        env_bearer_token = token
    try:
        uvicorn.run(app, host='0.0.0.0', port=6006)
    except Exception as e:
        print(f"API启动失败！\n报错：\n{e}")