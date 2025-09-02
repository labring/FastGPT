#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from abc import ABC, abstractmethod
import typing as t


class BaseEmbeddings(ABC):
    async def embed_text(self, text: str, **kwargs: t.Any) -> t.List[float]:
        """
        Embed a single text string.
        """
        if not isinstance(text, str):
            raise TypeError(f"text must be str, got {type(text)}")
        embs = await self.embed_texts([text], **kwargs)
        return embs[0]

    async def embed_texts(
        self, texts: t.List[str], **kwargs: t.Any
    ) -> t.List[t.List[float]]:
        """
        Embed multiple texts.
        """
        if not isinstance(texts, list):
            raise TypeError(f"texts must be a list, got {type(texts)}")
        return await self.aembed_documents(texts, **kwargs)

    @abstractmethod
    async def aembed_query(self, text: str, **kwargs: t.Any) -> t.List[float]: ...

    @abstractmethod
    async def aembed_documents(
        self, texts: t.List[str], **kwargs: t.Any
    ) -> t.List[t.List[float]]: ...
