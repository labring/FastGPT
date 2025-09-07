from pydantic import Field
from typing import Optional, Dict, Any, List
from diting_server.common.schema import Usage, StatusEnum, BaseSchema, ModelConfig


class Metadata(BaseSchema):
    chunk_id: Optional[str] = Field(None, description="分片ID")
    total_chunks: Optional[int] = Field(None, description="总分片数")
    project_name: Optional[str] = Field(None, description="项目名称")
    created_at: Optional[str] = Field(None, description="创建时间")


class SynthesizerConfig(BaseSchema):
    synthesizer_name: str = Field(..., description="合成器名称")
    config: Optional[Dict[str, Any]] = Field(None, description="算法配置参数")


class SynthesizerDefinition(BaseSchema):
    name: str = Field(..., description="Unique identifier for the synthesizer")
    description: str = Field(
        ..., description="Human-readable description of what the synthesizer measures"
    )
    required_input: List[str] = Field(
        ..., description="List of required input fields for this synthesizer"
    )


class InputData(BaseSchema):
    context: Optional[list[str]] = Field(None, description="上下文")
    themes: Optional[List[str]] = Field(None, description="主题列表")


class DatasetSynthesisRequest(BaseSchema):
    llm_config: ModelConfig = Field(..., description="数据生成LLM模型配置")
    embedding_config: Optional[ModelConfig] = Field(
        None, description="数据生成embedding模型配置"
    )
    synthesizer_config: SynthesizerConfig = Field(..., description="数据生成算法配置")
    input_data: InputData = Field(..., description="数据生成输入数据")
    metadata: Optional[Metadata] = Field(None, description="分片信息")


class QAPair(BaseSchema):
    question: str = Field(..., description="问题")
    answer: str = Field(..., description="答案")


class SyntheticQAResult(BaseSchema):
    qa_pair: QAPair = Field(..., description="生成的问答对列表")
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="生成过程的元信息，如模型版本、时间、分片ID等"
    )


class DatasetSynthesisResponse(BaseSchema):
    request_id: str = Field(..., description="请求唯一标识符")
    status: StatusEnum = Field(..., description="数据合成状态")
    data: Optional[SyntheticQAResult] = Field(None, description="生成的数据结果")
    usages: Optional[List[Usage]] = Field(None, description="使用token情况")
    metadata: Optional[Dict[str, Any]] = Field(None, description="元数据信息")
    error: Optional[str] = Field(None, description="错误信息")
