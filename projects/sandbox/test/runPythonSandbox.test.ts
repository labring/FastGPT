import { runPythonSandbox } from '../src/sandbox/utils';
import { RunCodeDto } from '../src/sandbox/dto/create-sandbox.dto';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

describe('runPythonSandbox', () => {
  beforeAll(async () => {
    // Setup if needed
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  it('should execute simple Python code successfully', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    return {"result": "hello world", "status": "success"}
      `,
      variables: {}
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      result: 'hello world',
      status: 'success'
    });
    expect(result.log).toBe('');
  });

  it('should handle variables correctly', async () => {
    const dto: RunCodeDto = {
      code: `
def main(x, y):
    return {"sum": x + y, "product": x * y}
      `,
      variables: { x: 5, y: 3 }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      sum: 8,
      product: 15
    });
  });

  it('should handle string variables', async () => {
    const dto: RunCodeDto = {
      code: `
def main(name, greeting):
    return {"message": f"{greeting}, {name}!"}
      `,
      variables: {
        name: 'FastGPT',
        greeting: 'Hello'
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      message: 'Hello, FastGPT!'
    });
  });

  it('should handle list and dict variables', async () => {
    const dto: RunCodeDto = {
      code: `
def main(numbers, config):
    total = sum(numbers)
    return {
        "total": total,
        "count": len(numbers),
        "multiplier": config["multiplier"],
        "final_result": total * config["multiplier"]
    }
      `,
      variables: {
        numbers: [1, 2, 3, 4, 5],
        config: { multiplier: 2 }
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      total: 15,
      count: 5,
      multiplier: 2,
      final_result: 30
    });
  });

  it('should reject empty code', async () => {
    const dto: RunCodeDto = {
      code: '',
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch('Code cannot be empty');
  });

  it('should reject null/undefined code', async () => {
    const dto: RunCodeDto = {
      code: null as any,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch('Code cannot be empty');
  });

  it('should handle null variables by setting to empty object', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    return {"message": "no variables needed"}
      `,
      variables: null as any
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      message: 'no variables needed'
    });
  });

  it('should reject invalid variables type', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    return {"test": True}
      `,
      variables: 'invalid' as any
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch('Variables must be an object');
  });

  it('should handle Python syntax errors', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    return {"invalid": syntax error here}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Run failed|error/);
  });

  it('should handle runtime errors in Python code', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    x = 1 / 0  # Division by zero
    return {"result": x}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(
      /division by zero|Error calling main function/
    );
  });

  it('should handle missing main function', async () => {
    const dto: RunCodeDto = {
      code: `
def helper():
    return "helper function"
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/main|not defined/);
  });

  it('should handle main function with wrong parameters', async () => {
    const dto: RunCodeDto = {
      code: `
def main(required_param):
    return {"param": required_param}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(
      /missing required argument|Error calling main function/
    );
  });

  it('should handle mathematical operations', async () => {
    const dto: RunCodeDto = {
      code: `
import math

def main(radius):
    area = math.pi * radius ** 2
    circumference = 2 * math.pi * radius
    return {
        "area": round(area, 2),
        "circumference": round(circumference, 2)
    }
      `,
      variables: { radius: 5 }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn.area).toBeCloseTo(78.54, 1);
    expect(result.codeReturn.circumference).toBeCloseTo(31.42, 1);
  });

  it('should handle boolean variables', async () => {
    const dto: RunCodeDto = {
      code: `
def main(is_enabled, is_admin):
    return {
        "enabled": is_enabled,
        "admin": is_admin,
        "access_level": "full" if is_admin else "limited" if is_enabled else "none"
    }
      `,
      variables: {
        is_enabled: true,
        is_admin: false
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      enabled: true,
      admin: false,
      access_level: 'limited'
    });
  });

  it('should handle None values', async () => {
    const dto: RunCodeDto = {
      code: `
def main(value):
    return {
        "is_none": value is None,
        "value": value,
        "default": value if value is not None else "default_value"
    }
      `,
      variables: {
        value: null
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      is_none: true,
      value: null,
      default: 'default_value'
    });
  });

  it('should handle complex data structures', async () => {
    const dto: RunCodeDto = {
      code: `
def main(data):
    result = {}
    for key, value in data.items():
        if isinstance(value, list):
            result[key] = sum(value)
        elif isinstance(value, dict):
            result[key] = len(value)
        else:
            result[key] = str(value).upper()
    return result
      `,
      variables: {
        data: {
          numbers: [1, 2, 3],
          config: { a: 1, b: 2 },
          name: 'test'
        }
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      numbers: 6,
      config: 2,
      name: 'TEST'
    });
  });

  it('should block dangerous imports', async () => {
    const dto: RunCodeDto = {
      code: `
import os

def main():
    return {"result": "should not work"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Importing os is not allowed|error/);
  });

  it('should handle function with default parameters', async () => {
    const dto: RunCodeDto = {
      code: `
def main(x, y=10):
    return {"x": x, "y": y, "sum": x + y}
      `,
      variables: { x: 5 }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      x: 5,
      y: 10,
      sum: 15
    });
  });

  it('should block dangerous subprocess import', async () => {
    const dto: RunCodeDto = {
      code: `
import subprocess

def main():
    return {"result": "should not work"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(
      /Importing subprocess is not allowed|error/
    );
  });

  it('should block dangerous sys import', async () => {
    const dto: RunCodeDto = {
      code: `
import sys

def main():
    return {"result": "should not work"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Importing sys is not allowed|error/);
  });

  it('should block dangerous socket import', async () => {
    const dto: RunCodeDto = {
      code: `
import socket

def main():
    return {"result": "should not work"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Importing socket is not allowed|error/);
  });

  it('should block dangerous ctypes import', async () => {
    const dto: RunCodeDto = {
      code: `
import ctypes

def main():
    return {"result": "should not work"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Importing ctypes is not allowed|error/);
  });

  it('should block from import of dangerous modules', async () => {
    const dto: RunCodeDto = {
      code: `
from os import system

def main():
    return {"result": "should not work"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Importing os is not allowed|error/);
  });

  it('should remove print statements from code', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    print("This should be removed")
    return {"result": "success"}
      `,
      variables: {}
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn).toEqual({
      result: 'success'
    });
  });

  it('should handle timeout for infinite loops', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    while True:
        pass
    return {"result": "never reached"}
      `,
      variables: {}
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(
      /Timeout error or blocked by system security policy|error/
    );
  }, 15000); // Increase timeout for this test

  it('should handle complex nested data structures', async () => {
    const dto: RunCodeDto = {
      code: `
def main(data):
    processed = {}
    for key, value in data.items():
        if isinstance(value, dict):
            processed[key] = {
                "keys": list(value.keys()),
                "values": list(value.values()),
                "count": len(value)
            }
        elif isinstance(value, list):
            processed[key] = {
                "length": len(value),
                "sum": sum(x for x in value if isinstance(x, (int, float))),
                "types": [type(x).__name__ for x in value]
            }
        else:
            processed[key] = {"value": value, "type": type(value).__name__}
    return processed
      `,
      variables: {
        data: {
          numbers: [1, 2, 3, 4.5],
          config: { enabled: true, max: 100 },
          name: 'test'
        }
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn.numbers).toEqual({
      length: 4,
      sum: 10.5,
      types: ['int', 'int', 'int', 'float']
    });
    expect(result.codeReturn.config).toEqual({
      keys: ['enabled', 'max'],
      values: [true, 100],
      count: 2
    });
    expect(result.codeReturn.name).toEqual({
      value: 'test',
      type: 'str'
    });
  });

  it('should handle invalid variable names gracefully', async () => {
    const dto: RunCodeDto = {
      code: `
def main():
    return {"result": "success"}
      `,
      variables: {
        '': 'empty_key',
        valid_key: 'valid_value'
      }
    };

    await expect(runPythonSandbox(dto)).rejects.toMatch(/Invalid variable name|error/);
  });

  it('should handle very large numbers', async () => {
    const dto: RunCodeDto = {
      code: `
def main(big_num):
    return {
        "original": big_num,
        "squared": big_num ** 2,
        "as_string": str(big_num)
    }
      `,
      variables: {
        big_num: 123456789012345
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn.original).toBe(123456789012345);
    expect(result.codeReturn.squared).toBe(123456789012345 ** 2);
    expect(result.codeReturn.as_string).toBe('123456789012345');
  });

  it('should handle unicode strings correctly', async () => {
    const dto: RunCodeDto = {
      code: `
def main(text, emoji):
    return {
        "combined": text + " " + emoji,
        "lengths": {
            "text": len(text),
            "emoji": len(emoji),
            "combined": len(text + " " + emoji)
        }
    }
      `,
      variables: {
        text: 'Hello 世界',
        emoji: '🚀✨'
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn.combined).toBe('Hello 世界 🚀✨');
    expect(result.codeReturn.lengths.text).toBe(8);
    expect(result.codeReturn.lengths.emoji).toBe(2);
  });

  it('should allow safe imports like json and math', async () => {
    const dto: RunCodeDto = {
      code: `
import json
import math

def main(data):
    serialized = json.dumps(data)
    deserialized = json.loads(serialized)
    pi_value = math.pi
    
    return {
        "serialized": serialized,
        "deserialized": deserialized,
        "pi": round(pi_value, 6)
    }
      `,
      variables: {
        data: { key: 'value', number: 42 }
      }
    };

    const result = await runPythonSandbox(dto);

    expect(result).toBeDefined();
    expect(result.codeReturn.deserialized).toEqual({ key: 'value', number: 42 });
    expect(result.codeReturn.pi).toBeCloseTo(3.141593, 6);
  });
});
