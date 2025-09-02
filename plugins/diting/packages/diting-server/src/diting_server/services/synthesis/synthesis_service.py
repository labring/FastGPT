#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Optional, Any, Type
from diting_server.apis.v1.synthesis.data_models import (
    DatasetSynthesisRequest,
    DatasetSynthesisResponse,
    ModelConfig,
    SynthesizerConfig,
    SyntheticQAResult,
    QAPair,
)
from diting_core.synthesis.base_synthesizer import BaseSynthesizer
from diting_core.synthesis.base_corpus import BaseCorpus
from diting_server.services.synthesis.synthesizers import SynthesizerFactory
from diting_core.models.llms.factory import llm_factory
from diting_server.common.logging_config.config import get_logger
from diting_core.models.embeddings.factory import embedding_factory
from diting_server.common.callback import (
    GetEmbedTokenCallbackHandler,
    GetLLMTokenCallbackHandler,
)
from diting_server.exceptions.synthesis import (
    ModelConfigException,
    SynthesizerNotFoundException,
)
from diting_server.common.utils import resolve_model_config
from diting_server.common.schema import StatusEnum
from diting_server.common.utils import compute_token_usage

logger = get_logger(__name__)


class SynthesizerService:
    async def run_synthesizer(
        self, request: DatasetSynthesisRequest, request_id: str
    ) -> DatasetSynthesisResponse:
        corpus = BaseCorpus(
            context=request.input_data.context, themes=request.input_data.context
        )
        try:
            result = await self._synthesize_case_with_synthesizer(
                corpus=corpus,
                synthesizer_config=request.synthesizer_config,
                llm_config=request.llm_config,
                embedding_config=request.embedding_config,
            )
            synthesizer_result = result.get("llm_case")
            usages = result.get("usages", [])
            error_msg = result.get("error", None)
        except (ModelConfigException, SynthesizerNotFoundException) as e:
            logger.error(f"Error in synthesizing case: {str(e)}")
            raise e
        q_a_pair = QAPair(
            question=""
            if error_msg
            else (synthesizer_result.user_input if synthesizer_result else ""),
            answer=""
            if error_msg
            else (synthesizer_result.expected_output if synthesizer_result else ""),
        )
        data = SyntheticQAResult(
            qa_pair=q_a_pair,
            metadata={}
            if error_msg
            else (synthesizer_result.metadata if synthesizer_result else {}),
        )
        status = StatusEnum.FAILED if error_msg else StatusEnum.SUCCESS
        response = DatasetSynthesisResponse(
            request_id=request_id,
            data=data,
            usages=usages,
            status=status,
            error=error_msg,
            metadata=None,
        )

        return response

    async def _synthesize_case_with_synthesizer(
        self,
        corpus: BaseCorpus,
        synthesizer_config: SynthesizerConfig,
        llm_config: Optional[ModelConfig] = None,
        embedding_config: Optional[ModelConfig] = None,
    ) -> dict[str, Any]:
        try:
            synthesizer: BaseSynthesizer = self._load_synthesizer(
                synthesizer_config.synthesizer_name
            )()
        except Exception as ex:
            logger.error(
                f"Failed to load the synthesizer {synthesizer_config.synthesizer_name}. "
                f"Original error: {str(ex)}"
            )
            raise SynthesizerNotFoundException(
                f"Failed to load the synthesizer {synthesizer_config.synthesizer_name}. "
                "Please ensure that this synthesizer is supported and correctly configured. "
                f"Original error: {str(ex)}"
            )

        is_llm_required = hasattr(synthesizer, "model")
        is_embedding_required = hasattr(synthesizer, "embedding_model")
        callbacks: list[Any] = []
        get_embed_token = GetEmbedTokenCallbackHandler()
        get_llm_token = GetLLMTokenCallbackHandler()
        if is_llm_required and llm_config:
            llm_config_resolved = resolve_model_config(
                model=llm_config.name,
                base_url=llm_config.base_url,
                api_key=llm_config.api_key,
            )
            llm_model = llm_factory(**llm_config_resolved)
            setattr(synthesizer, "model", llm_model)
            callbacks.append(get_llm_token)
        elif is_llm_required and (not llm_config):
            logger.error(
                f"LLM model is required for synthesizer {synthesizer_config.synthesizer_name}. "
                "Please ensure that you have configured the appropriate LLM model."
            )
            raise ModelConfigException(
                f"LLM model is required for synthesizer {synthesizer_config.synthesizer_name}. "
                "Please ensure that you have configured the appropriate LLM model."
            )

        if is_embedding_required and embedding_config:
            embedding_config_resolved = resolve_model_config(
                model=embedding_config.name,
                base_url=embedding_config.base_url,
                api_key=embedding_config.api_key,
            )
            embedding_model = embedding_factory(**embedding_config_resolved)
            setattr(synthesizer, "embedding_model", embedding_model)
            callbacks.append(get_embed_token)
        elif is_embedding_required and (not embedding_config):
            logger.error(
                f"Embedding model is required for synthesizer {synthesizer_config.synthesizer_name}. "
                "Please ensure that you have configured the appropriate embedding model."
            )
            raise ModelConfigException(
                f"Embedding model is required for synthesizer {synthesizer_config.synthesizer_name} "
                "Please ensure that you have configured the appropriate embedding model."
            )
        llm_case = None
        error = None
        try:
            llm_case = await synthesizer.apply(corpus=corpus, callbacks=callbacks)
        except Exception as ex:
            logger.error(f"Synthesizer application error: {str(ex)}")
            error = str(ex)
        finally:
            usages = compute_token_usage(
                llm_usages=get_llm_token.usages,
                embed_usages=get_embed_token.usages,
            )

        return {"llm_case": llm_case, "usages": usages, "error": error}

    def _load_synthesizer(self, synthesizer_name: str) -> Type[BaseSynthesizer]:
        synthesizer_factory = SynthesizerFactory()
        synthesizer = synthesizer_factory.create(synthesizer_name)
        return synthesizer


synthesizer_service = SynthesizerService()
