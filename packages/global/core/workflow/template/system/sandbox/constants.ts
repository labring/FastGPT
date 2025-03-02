export const JS_TEMPLATE = `function main({data1, data2}){
    
    return {
        result: data1,
        data2
    }
}`;

export const PY_TEMPLATE = `def main(data1, data2) -> dict:
    return {
        "result": data1,
        "data2": data2
    }
`;
