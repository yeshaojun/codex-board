export class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.sequence = 0;
    this.pending = new Map();
    this.closed = false;
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const fail = () => reject(new Error("无法连接 Codex 的本机调试通道。"));
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", fail, { once: true });
      this.socket.addEventListener("close", fail, { once: true });
    });
    this.socket.addEventListener("message", (event) => this.receive(event));
    this.socket.addEventListener("close", () => this.fail(new Error("Codex 调试通道已关闭。")));
  }

  receive(event) {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message));
    else pending.resolve(message.result);
  }

  send(method, params = {}, timeoutMs = 15_000) {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Codex 调试通道不可用。"));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex 调试命令超时：${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  fail(error) {
    if (this.closed) return;
    this.closed = true;
    this.pending.forEach((pending) => {
      clearTimeout(pending.timer);
      pending.reject(error);
    });
    this.pending.clear();
  }

  close() {
    if (this.closed) return;
    this.socket?.close();
    this.fail(new Error("Codex 调试连接已关闭。"));
  }
}

export function validateLoopbackWebSocketUrl(value, port) {
  const url = new URL(value);
  if (
    url.protocol !== "ws:"
    || url.hostname !== "127.0.0.1"
    || url.port !== String(port)
    || !url.pathname.startsWith("/devtools/page/")
    || url.username
    || url.password
  ) throw new Error("拒绝非本机 Codex 调试目标。");
  return url.href;
}
