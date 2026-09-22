# OpenAgentOSCore

> English | [简体中文](./README.zh-CN.md)

The **pure-mechanism core** of a voice agent. Extracted as a standalone project from AIVoiceAgent's `brain/`.

## What it is

This project **provides only the mechanism skeleton and contains no intent knowledge** — no intents table, no keywords, no LLM classification. That "knowledge" is attached by the application layer (e.g. AIVoiceAgent) as filters / plugins.

Two mechanisms:

- **`FilterChain`** (`src/filter-chain.js`) — a pluggable check chain. After a user message enters the main-control state and before it falls through to the default LLM conversation, each registered filter is asked in turn "do you want to handle this?". The first non-pass verdict wins. A filter is a pure decision-maker: it takes a read-only snapshot as input, returns verdict data, and produces no side effects.
- **`PluginHost`** (`src/plugin-host.js`) — launches a plugin as an independent child process, communicating over stdin/stdout NDJSON (one JSON-RPC message per line). Any language that can read/write stdin/stdout JSON can be used to write a plugin. Contract: `init` / `onWake` / `onUtter` / `onExit`.

## Usage

```js
import { FilterChain, PluginHost } from "open-agent-os-core";

const chain = new FilterChain(console.log).use({
  name: "my-filter",
  check({ text, images }) {
    // return null (=pass) / { action:"handled", speak } / { action:"takeover", ... }
    return null;
  },
});

const decision = await chain.run({ text: "hello", images: [] });

const host = new PluginHost("my-plugin", {
  command: "node",
  args: ["plugin.js"],
  cwd: "/path/to/plugin/dir", // defaults to process.cwd(); the core does not assume the plugin lives in its own directory
});
await host.start();
```

## Dependency reference (for application layers such as AIVoiceAgent)

Published on GitHub — reference it directly as a git dependency:

```json
{ "dependencies": { "open-agent-os-core": "github:jackieju/OpenAgentOSCore" } }
```

For local development you can also use a file: dependency:

```json
{ "dependencies": { "open-agent-os-core": "file:../OpenAgentOSCore" } }
```

The import code is identical either way; switching only changes this one line.

## No external dependencies

Uses only Node built-in modules (`node:child_process`). `npm run check` performs a syntax self-check.

## License

AGPL-3.0
