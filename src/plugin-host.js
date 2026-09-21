// 插件宿主：把插件作为独立子进程拉起，走 stdin/stdout NDJSON（每行一条 JSON-RPC）。
// 只要能读写 stdin/stdout JSON，插件可用任意语言写。契约：init/onWake/onUtter/onExit。
import { spawn } from "node:child_process";

export class PluginHost {
  // name: 插件名；spec: { command, args, cwd }；logger: 可选日志函数。
  // spec.cwd 由应用层显式告诉核心「插件在哪个目录跑」，缺省回退 process.cwd()——
  // 核心不假设插件与自己同目录（这是从 AIVoiceAgent 拆分独立后解除的耦合点）。
  constructor(name, spec, logger) {
    this.name = name;
    this.spec = spec;
    this.log = logger || (() => {});
    this.child = null;
    this.seq = 0;
    this.pending = new Map(); // id -> { resolve, reject }
    this.buf = "";
    this.dead = false;
    this.meta = null; // init 返回的元信息
  }

  // 拉起子进程并完成 init 握手。
  async start() {
    this.child = spawn(this.spec.command, this.spec.args || [], {
      cwd: this.spec.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.child.stdout.on("data", (d) => this._onStdout(d));
    this.child.stderr.on("data", (d) => {
      const line = d.toString().trim();
      if (line) this.log(`[plugin:${this.name}:err] ${line}`);
    });
    this.child.on("exit", (code) => {
      this.dead = true;
      this.log(`[plugin:${this.name}] 子进程退出 code=${code}`);
      // 子进程崩溃：把所有等待中的调用全部 reject，避免调用方永久挂起。
      for (const [, p] of this.pending) {
        p.reject(new Error(`插件 ${this.name} 进程已退出`));
      }
      this.pending.clear();
    });
    this.child.on("error", (e) => {
      this.dead = true;
      this.log(`[plugin:${this.name}] spawn 失败: ${e.message}`);
      for (const [, p] of this.pending) p.reject(e);
      this.pending.clear();
    });

    this.meta = await this.call("init", {});
    this.log(`[plugin:${this.name}] init ok: ${JSON.stringify(this.meta)}`);
    return this.meta;
  }

  // 逐行切分 stdout，每行一条 JSON-RPC 响应，按 id 兑现对应 Promise。
  _onStdout(chunk) {
    this.buf += chunk.toString();
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        this.log(`[plugin:${this.name}] 非法 JSON 行: ${line.slice(0, 120)}`);
        continue;
      }
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(msg.error.message || "插件返回错误"));
      } else {
        p.resolve(msg.result);
      }
    }
  }

  // 发一条 JSON-RPC 请求，返回等待对应 id 响应的 Promise（带超时兜底）。
  call(method, params, timeoutMs = 120000) {
    if (this.dead || !this.child) {
      return Promise.reject(new Error(`插件 ${this.name} 不可用`));
    }
    const id = ++this.seq;
    const req = { jsonrpc: "2.0", id, method, params: params || {} };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`插件 ${this.name}.${method} 超时`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.child.stdin.write(JSON.stringify(req) + "\n");
      } catch (e) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  onWake(intent, params) {
    return this.call("onWake", { intent, params: params || {} });
  }
  onUtter(text) {
    return this.call("onUtter", { text });
  }
  onExit() {
    return this.call("onExit", {});
  }

  stop() {
    if (this.child && !this.dead) {
      try {
        this.child.kill();
      } catch {
        /* ignore */
      }
    }
    this.dead = true;
  }
}
