# Token 计数功能

本文档介绍了 deno-proxy 项目中新增的 token 计数功能，包括 Claude API 集成和本地 tiktoken 实现。

## 功能概述

- **Claude API 集成**: 使用 Anthropic 的官方 `/v1/messages/count_tokens` API 进行精确的 token 计算
- **本地 tiktoken 实现**: 当 Claude API 不可用时，使用本地算法进行 token 估算
- **Token 倍数支持**: 通过环境变量 `TOKEN_MULTIPLIER` 调整 token 计数结果
- **API 端点**: 提供 `/v1/messages/count_tokens` 端点供客户端直接调用

## 环境变量配置

### 新增环境变量

| 变量名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `TOKEN_MULTIPLIER` | number | 1.0 | Token 倍数，用于调整计算结果 |
| `CLAUDE_API_KEY` | string | - | Claude API 密钥，用于调用官方 token 计数 API |

### 示例配置

```bash
# 设置 token 倍数为 2.5（用于计费调整）
export TOKEN_MULTIPLIER=2.5

# 配置 Claude API 密钥以使用官方 token 计数
export CLAUDE_API_KEY="your-claude-api-key-here"

# 其他现有配置
export PORT=3456
export UPSTREAM_BASE_URL="http://127.0.0.1:8000/v1/chat/completions"
```

## API 使用

### count_tokens 端点

**端点**: `POST /v1/messages/count_tokens`

**请求体**:
```json
{
  "model": "claude-3-sonnet-20240229",
  "messages": [
    {"role": "user", "content": "Hello, how are you?"},
    {"role": "assistant", "content": "I'm doing well, thank you!"},
    {"role": "user", "content": "Can you help me?"}
  ]
}
```

**响应**:
```json
{
  "input_tokens": 135,
  "output_tokens": null
}
```

### 使用 curl 测试

```bash
curl -X POST http://localhost:3456/v1/messages/count_tokens \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet-20240229",
    "messages": [
      {"role": "user", "content": "Hello, world"}
    ]
  }'
```

## 实现细节

### Token 计算策略

1. **优先使用 Claude API**: 如果配置了 `CLAUDE_API_KEY`，优先调用 Anthropic 官方 API
2. **本地 tiktoken 备用**: 当 Claude API 不可用时，使用本地 tiktoken 实现
3. **应用倍数**: 所有计算结果都会乘以 `TOKEN_MULTIPLIER`

### 本地 tiktoken 实现

项目包含一个简化的 tiktoken 实现，支持：
- 英文单词和标点符号
- 中文字符
- 数字和常见编程符号
- 基于字符模式的启发式分词

### 集成到主流程

- 在处理 `/v1/messages` 请求时自动计算 input tokens
- 在流式响应中正确应用 token 倍数
- 在 `message_start` 和 `message_delta` 事件中包含准确的 token 计数

## 测试

### 运行 token 计数测试

```bash
# 基础测试
deno run --allow-env --allow-net src/test_token_counter.ts

# 测试不同倍数
TOKEN_MULTIPLIER=2.5 deno run --allow-env --allow-net src/test_token_counter.ts

# 测试 API 端点（需要先启动服务器）
deno run --allow-net test_api.ts
```

### 测试用例

测试脚本包含以下场景：
1. 简单英文对话
2. 中文对话
3. 带系统提示的请求
4. 仅本地计算（不调用 Claude API）
5. 长文本处理

## 计费示例

使用 `TOKEN_MULTIPLIER=2.5` 的计费示例：

```
原始 token 数: 54
倍数: 2.5
计费 token 数: 135 (54 * 2.5)
```

## 注意事项

1. **API 限制**: Claude 的 count_tokens API 有速率限制，建议合理使用
2. **精度差异**: 本地 tiktoken 实现可能与官方 API 有细微差异
3. **性能考虑**: 本地计算速度更快，但精度略低于官方 API
4. **成本控制**: 通过倍数调整可以用于成本核算和利润管理

## 故障排除

### 常见问题

1. **Claude API 调用失败**
   - 检查 `CLAUDE_API_KEY` 是否正确
   - 确认网络连接正常
   - 查看日志中的详细错误信息

2. **Token 计数不准确**
   - 尝试使用不同的 `TOKEN_MULTIPLIER` 值
   - 对比本地计算和 Claude API 的结果
   - 检查是否包含系统提示的 token

3. **API 端点不可用**
   - 确认服务器正在运行
   - 检查端口配置
   - 查看服务器日志

## 更新日志

- **v1.0.0**: 初始实现，支持 Claude API 集成和本地 tiktoken
- 添加 `TOKEN_MULTIPLIER` 环境变量支持
- 实现 `/v1/messages/count_tokens` 端点
- 集成到主消息处理流程