#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Any, List
from langchain_core.embeddings import Embeddings
from pydantic import BaseModel, Field

from diting_core.models.embeddings.base_model import BaseEmbeddings
from diting_core.callbacks.manager import new_group
from diting_core.callbacks.base import ChainType


class PrivateEmbeddings(BaseModel, BaseEmbeddings):
    model: str
    client: Any = Field(default=None, exclude=True)
    async_client: Any = Field(default=None, exclude=True)

    async def aembed_query(self, text: str, **kwargs: Any) -> List[float]:
        run_manager, _ = await new_group(
            name=self.__repr__(),
            inputs={"embed_input": text},
            callbacks=kwargs.pop("callbacks", None),
        )
        result = await self.async_client.embeddings.create(
            model=self.model, input=[text]
        )
        await run_manager.on_chain_end(
            outputs={"result": result},
            inputs={"embed_input": text},
            chain_type=ChainType.EMBED,
        )
        return result.data[0].embedding

    async def aembed_documents(
        self, texts: List[str], **kwargs: Any
    ) -> List[List[float]]:
        run_manager, _ = await new_group(
            name=self.__repr__(),
            inputs={"embed_input": texts},
            callbacks=kwargs.pop("callbacks", None),
        )
        result = await self.async_client.embeddings.create(
            model=self.model, input=texts
        )
        await run_manager.on_chain_end(
            outputs={"result": result},
            inputs={"embed_input": texts},
            chain_type=ChainType.EMBED,
        )
        return [embedding.embedding for embedding in result.data]


class LangchainEmbeddingsWrapper(BaseEmbeddings):
    """
    Wrapper for any embeddings from langchain.
    """

    def __init__(
        self,
        embeddings: Embeddings,
    ):
        self.embeddings = embeddings
        super().__init__()

    async def aembed_query(self, text: str, **kwargs: Any) -> List[float]:
        """
        Asynchronously embed a single query text.
        """
        if not isinstance(text, str):
            raise TypeError(f"text must be str, got {type(text)}")
        return await self.embeddings.aembed_query(text)

    async def aembed_documents(
        self, texts: List[str], **kwargs: Any
    ) -> List[List[float]]:
        """
        Asynchronously embed multiple documents.
        """
        if not isinstance(texts, list):
            raise TypeError(f"texts must be a list, got {type(texts)}")
        return await self.embeddings.aembed_documents(texts)

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(embeddings={self.embeddings.__class__.__name__}(...))"
