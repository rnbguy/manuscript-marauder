export class Socks5Proxy {
  sshChildProcess?: Deno.ChildProcess;
  recoverLoop?: Promise<void>;

  closed = false;
  path: URL;
  constructor(path: string) {
    this.path = new URL(path);
  }

  url(): string {
    if (this.path.protocol === "ssh:") {
      return "socks5://localhost:1234";
    } else {
      return this.path.href;
    }
  }

  start() {
    if (this.path.protocol === "ssh:") {
      this.recoverLoop = (async () => {
        while (!this.closed) {
          this.sshChildProcess = new Deno.Command("ssh", {
            args: [
              "-4NTD",
              "1234",
              "-o",
              "ExitOnForwardFailure=yes",
              this.path.host,
            ],
          }).spawn();
          await this.sshChildProcess.status;
        }
      })();
    }
  }

  async end() {
    if (this.sshChildProcess) {
      try {
        this.sshChildProcess.kill("SIGINT");
      } finally {
        this.closed = true;
        await this.recoverLoop;
      }
    }
  }
}
