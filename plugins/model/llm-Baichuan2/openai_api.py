# coding=utf-8
# Implements API for Baichuan2-7B-Chat in OpenAI's format. (https://platform.openai.com/docs/api-reference/chat)
# Usage: python openai_api.py

import gc
import time
import torch
import uvicorn
from pydantic import BaseModel, Field, validator
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Union
from transformers import AutoModelForCausalLM, AutoTokenizer
from sse_starlette.sse import ServerSentEvent, EventSourceResponse
from transformers.generation.utils import GenerationConfig
import random
import string


@asynccontextmanager
async def lifespan(app: FastAPI): # collects GPU memory
    yield
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ModelCard(BaseModel):
    id: str
    object: str = "model"
    created: int = Field(default_factory=lambda: int(time.time()))
    owned_by: str = "owner"
    root: Optional[str] = None
    parent: Optional[str] = None
    permission: Optional[list] = None

class ModelList(BaseModel):
    object: str = "list"
    data: List[str] = []  # Assuming ModelCard is a string type. Replace with the correct type if not.

class ChatMessage(BaseModel):
    role: str
    content: str

    @validator('role')
    def check_role(cls, v):
        if v not in ["user", "assistant", "system"]:
            raise ValueError('role must be one of "user", "assistant", "system"')
        return v

class DeltaMessage(BaseModel):
    role: Optional[str] = None
    content: Optional[str] = None

    @validator('role', allow_reuse=True)
    def check_role(cls, v):
        if v is not None and v not in ["user", "assistant", "system"]:
            raise ValueError('role must be one of "user", "assistant", "system"')
        return v

class ChatCompletionRequest(BaseModel):
    model: str
    messages: List[ChatMessage]
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    max_length: Optional[int] = 8192  # max_length should be an integer.
    stream: Optional[bool] = False

class ChatCompletionResponseChoice(BaseModel):
    index: int
    message: ChatMessage
    finish_reason: str

    @validator('finish_reason')
    def check_finish_reason(cls, v):
        if v not in ["stop", "length"]:
            raise ValueError('finish_reason must be one of "stop" or "length"')
        return v

class ChatCompletionResponseStreamChoice(BaseModel):
     index: int
     delta: DeltaMessage
     finish_reason: Optional[str]

     @validator('finish_reason', allow_reuse=True)
     def check_finish_reason(cls, v):
         if v is not None and v not in ["stop", "length"]:
             raise ValueError('finish_reason must be one of "stop" or "length"')
         return v

class ChatCompletionResponse(BaseModel):
     id:str 
     object:str 
     
     @validator('object')
     def check_object(cls,v): 
         if v not in ["chat.completion","chat.completion.chunk"]: 
             raise ValueError("object must be one of 'chat.completion' or 'chat.completion.chunk'")
         return v
     
     created :Optional[int]=Field(default_factory=lambda:int(time.time()))
     model:str 
     choices :List[Union[ChatCompletionResponseChoice,ChatCompletionResponseStreamChoice]]


def generate_id():
    possible_characters = string.ascii_letters + string.digits
    random_string = ''.join(random.choices(possible_characters, k=29))
    return 'chatcmpl-' + random_string
    

@app.get("/v1/models", response_model=ModelList)
async def list_models():
    global model_args
    model_card = ModelCard(id="gpt-3.5-turbo")
    return ModelList(data=[model_card])


@app.post("/v1/chat/completions", response_model=ChatCompletionResponse)
async def create_chat_completion(request: ChatCompletionRequest):
    global model, tokenizer
    if request.messages[-1].role != "user":
        raise HTTPException(status_code=400, detail="Invalid request")
    query = request.messages[-1].content
    prev_messages = request.messages[:-1]
    if len(prev_messages) > 0 and prev_messages[0].role == "system":
        query = prev_messages.pop(0).content + query
    messages = []
    for message in prev_messages:
        messages.append({"role": message.role, "content": message.content})
    
    messages.append({"role": "user", "content": query})
    
    if request.stream:
        generate = predict(messages, request.model)
        return EventSourceResponse(generate, media_type="text/event-stream")
    
    response = '本接口不支持非stream模式'
    choice_data = ChatCompletionResponseChoice(
        index=0,
        message=ChatMessage(role="assistant", content=response),
        finish_reason="stop"
    )
    id='chatcmpl-7QyqpwdfhqwajicIEznoc6Q47XAyW'

    return ChatCompletionResponse(id=id,model=request.model, choices=[choice_data], object="chat.completion")


async def predict(messages: List[List[str]], model_id: str):
    global model, tokenizer
    id = generate_id()
    created = int(time.time())
    choice_data = ChatCompletionResponseStreamChoice(
        index=0,
        delta=DeltaMessage(role="assistant",content=""),
        finish_reason=None
    )
    chunk = ChatCompletionResponse(id=id,object="chat.completion.chunk",created=created,model=model_id, choices=[choice_data])
    yield "{}".format(chunk.json(exclude_unset=True, ensure_ascii=False))

    current_length = 0

    for new_response in model.chat(tokenizer, messages, stream=True):
        if len(new_response) == current_length:
            continue

        new_text = new_response[current_length:]
        current_length = len(new_response)

        choice_data = ChatCompletionResponseStreamChoice(
            index=0,
            delta=DeltaMessage(content=new_text),
            finish_reason=None
        )
        chunk = ChatCompletionResponse(id=id,object="chat.completion.chunk",created=created,model=model_id, choices=[choice_data])
        yield "{}".format(chunk.json(exclude_unset=True, ensure_ascii=False))


    choice_data = ChatCompletionResponseStreamChoice(
        index=0,
        delta=DeltaMessage(),
        finish_reason="stop"
    )
    chunk = ChatCompletionResponse(id=id,object="chat.completion.chunk",created=created,model=model_id, choices=[choice_data])
    yield "{}".format(chunk.json(exclude_unset=True, ensure_ascii=False))
    yield '[DONE]'


def load_models():
    print("本次加载的大语言模型为: Baichuan-13B-Chat")
    tokenizer = AutoTokenizer.from_pretrained("baichuan-inc/Baichuan2-7B-Chat", use_fast=False, trust_remote_code=True)
    # model = AutoModelForCausalLM.from_pretrained("Baichuan2-13B-Chat", torch_dtype=torch.float32, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained("baichuan-inc/Baichuan2-7B-Chat", torch_dtype=torch.float16, trust_remote_code=True)
    model = model.cuda() 
    model.generation_config = GenerationConfig.from_pretrained("baichuan-inc/Baichuan2-7B-Chat") 
    return tokenizer, model

if __name__ == "__main__":
    tokenizer, model = load_models()
    uvicorn.run(app, host='0.0.0.0', port=6006, workers=1)

    while True:
        try:
            # 在这里执行您的程序逻辑

            # 检查显存使用情况，如果超过阈值（例如90%），则触发垃圾回收
            if torch.cuda.is_available():
                gpu_memory_usage = torch.cuda.memory_allocated() / torch.cuda.max_memory_allocated()
                if gpu_memory_usage > 0.9:
                    gc.collect()
                    torch.cuda.empty_cache()
        except RuntimeError as e:
            if "out of memory" in str(e):
                print("显存不足，正在重启程序...")
                gc.collect()
                torch.cuda.empty_cache()
                time.sleep(5) # 等待一段时间以确保显存已释放
                tokenizer, model = load_models()
            else:
                raise e

    
