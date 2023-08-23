export class Socks5Proxy {
  path: URL;
  sshChildProcess?: Deno.ChildProcess;
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
      this.sshChildProcess = new Deno.Command("ssh", {
        args: [
          "-4NTD",
          "1234",
          "-o",
          "ExitOnForwardFailure=yes",
          this.path.host,
        ],
      }).spawn();
    }
  }

  async end() {
    if (this.sshChildProcess) {
      this.sshChildProcess.kill("SIGINT");
      await this.sshChildProcess.status;
    }
  }
}
