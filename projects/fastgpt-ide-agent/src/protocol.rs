use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// JSON-RPC 错误码的语义枚举，序列化时仍保持协议要求的数字格式。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JsonRpcErrorCode {
    MethodNotFound,
    InternalError,
    FileConflict,
    PermissionDenied,
    FileTooLarge,
    Unknown(i32),
}

impl JsonRpcErrorCode {
    pub const fn as_i32(self) -> i32 {
        match self {
            Self::MethodNotFound => -32601,
            Self::InternalError => -32603,
            Self::FileConflict => -32001,
            Self::PermissionDenied => -32003,
            Self::FileTooLarge => -32004,
            Self::Unknown(code) => code,
        }
    }

    pub const fn from_i32(code: i32) -> Self {
        match code {
            -32601 => Self::MethodNotFound,
            -32603 => Self::InternalError,
            -32001 => Self::FileConflict,
            -32003 => Self::PermissionDenied,
            -32004 => Self::FileTooLarge,
            _ => Self::Unknown(code),
        }
    }
}

impl Serialize for JsonRpcErrorCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i32(self.as_i32())
    }
}

impl<'de> Deserialize<'de> for JsonRpcErrorCode {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let code = i32::deserialize(deserializer)?;
        Ok(Self::from_i32(code))
    }
}

#[derive(Deserialize, Serialize, Debug)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JsonRpcError {
    pub code: JsonRpcErrorCode,
    pub message: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct JsonRpcNotification {
    pub jsonrpc: String,
    pub method: String,
    pub params: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn json_rpc_error_code_uses_numeric_wire_format() {
        let error = JsonRpcError {
            code: JsonRpcErrorCode::FileTooLarge,
            message: "File is too large".to_string(),
        };

        let serialized = serde_json::to_value(error).unwrap();
        assert_eq!(serialized["code"], json!(-32004));

        let known_error: JsonRpcError =
            serde_json::from_value(json!({ "code": -32001, "message": "conflict" })).unwrap();
        assert_eq!(known_error.code, JsonRpcErrorCode::FileConflict);

        let unknown_error: JsonRpcError =
            serde_json::from_value(json!({ "code": -32099, "message": "custom" })).unwrap();
        assert_eq!(unknown_error.code, JsonRpcErrorCode::Unknown(-32099));
    }
}
