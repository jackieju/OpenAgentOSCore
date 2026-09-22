# OpenAgentOSCore

> [English](./README.md) | 简体中文

语音 Agent 的**纯机制核心**。从 AIVoiceAgent 的 `brain/` 拆分独立而来。

## 定位

本项目**只提供机制骨架，不含任何意图知识**——没有 intents 表、没有关键词、不做 LLM 判别。这些"知识"由应用层（如 AIVoiceAgent）作为 filter / 插件挂上来。

两块机制：

- **`FilterChain`**（`src/filter-chain.js`）——可插拔的 check 链。用户消息进入主控后、落到默认 LLM 对话之前，逐个问已注册的 filter「这句话你要处理吗」，谁先给出非 pass 裁决就采纳它。filter 是纯判断器：输入只读快照，返回裁决数据，不产生副作用。
- **`PluginHost`**（`src/plugin-host.js`）——把插件作为独立子进程拉起，走 stdin/stdout NDJSON（每行一条 JSON-RPC）。只要能读写 stdin/stdout JSON，插件可用任意语言写。契约：`init` / `onWake` / `onUtter` / `onExit`。

## 用法

```js
import { FilterChain, PluginHost } from "open-agent-os-core";

const chain = new FilterChain(console.log).use({
  name: "my-filter",
  check({ text, images }) {
    // 返回 null(=pass) / { action:"handled", speak } / { action:"takeover", ... }
    return null;
  },
});

const decision = await chain.run({ text: "你好", images: [] });

const host = new PluginHost("my-plugin", {
  command: "node",
  args: ["plugin.js"],
  cwd: "/path/to/plugin/dir", // 缺省回退 process.cwd()，核心不假设插件与自己同目录
});
await host.start();
```

## 依赖引用（供 AIVoiceAgent 等应用层）

已发布到 GitHub，可直接按 git 依赖引用：

```json
{ "dependencies": { "open-agent-os-core": "github:jackieju/OpenAgentOSCore" } }
```

本地开发时也可用 file: 依赖：

```json
{ "dependencies": { "open-agent-os-core": "file:../OpenAgentOSCore" } }
```

两种方式的 import 代码完全一致，切换只改这一行。

## 无外部依赖

仅用 Node 内置模块（`node:child_process`）。`npm run check` 做语法自检。

## License

AGPL-3.0
