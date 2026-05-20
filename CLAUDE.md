# SupplyChain Cortex — AI 协作指南

## 识图能力

你的底层模型不具备原生识图能力。遇到图片时，**不要用 Read 工具读取图片**，改用 vision.js：

```
node ~/.claude/vision/vision.js "<图片路径>" "用中文描述这张图片"
```

### 触发场景
- 用户分享图片路径（本地或网络 URL）
- 消息中出现 "Saved attachments:" 并列出图片
- 用户要求分析、描述、识别图片内容

### 网络图片
```
node ~/.claude/vision/vision.js --url "<图片链接>" "用中文描述这张图片"
```
