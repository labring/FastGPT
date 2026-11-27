use serde::{Deserialize, Serialize, Serializer};

/// JSON-RPC 错误码的语义枚举，序列化时仍保持协议要求的数字格式。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(i32)]
pub enum JsonRpcErrorCode {
    ParseError = -32700,
    MethodNotFound = -32601,
    InternalError = -32603,
    FileConflict = -32001,
    PermissionDenied = -32003,
    FileTooLarge = -32004,
    DiskQuotaExceeded = -32005,
}

impl Serialize for JsonRpcErrorCode {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_i32(*self as i32)
    }
}

#[derive(Deserialize, Debug)]
pub struct JsonRpcRequest {
    pub id: serde_json::Value,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(Serialize, Debug)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

#[derive(Serialize, Debug)]
pub struct JsonRpcError {
    pub code: JsonRpcErrorCode,
    pub message: String,
}

#[derive(Serialize, Debug)]
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
    }
}
