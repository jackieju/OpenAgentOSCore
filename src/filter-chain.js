// filter 链机制（OpenAgentOSCore 核心骨架）。
// 定位：用户消息进入主控后、落到默认 LLM 对话之前的一道 check——
// 逐个问已注册的 filter「这句话你要处理吗」，谁先给出非 pass 裁决就采纳它。
//
// 分层红线：本模块不含任何意图知识（无 intents.json、无关键词表、无 LLM 判意图）。
// filter 是纯判断器：输入一句话的只读快照，返回裁决数据，不产生副作用
// （推插件入栈/起 PluginHost/speak 全由核心编排层看到裁决后自己做）。
//
// filter 契约：一个对象 { name, check(input) => decision|Promise<decision> }
//   input:    { text, images }          —— 只读，仅主控态调用（栈顶=main）
//   decision: null | { action: "pass" } —— 我不管，交给下一个 filter
//             { action: "handled", speak } —— 我处理了，念这句，停止链
//             { action: "takeover", plugin, intent, params, session, originalText }
//                                        —— 我要接管，交给核心去推栈/起插件

export class FilterChain {
  constructor(logger) {
    this.log = logger || (() => {});
    this.filters = [];
  }

  use(filter) {
    if (!filter || typeof filter.check !== "function") {
      throw new Error("filter 必须是 { name, check(input) } 形状");
    }
    this.filters.push(filter);
    return this;
  }

  async run(input) {
    for (const f of this.filters) {
      let decision;
      try {
        decision = await f.check({ text: input.text, images: input.images || [] });
      } catch (e) {
        this.log(`[filter:${f.name || "?"}] check 异常，跳过: ${e.message}`);
        continue;
      }
      if (!decision || decision.action === "pass") continue;
      return { ...decision, _filter: f.name };
    }
    return null;
  }
}
