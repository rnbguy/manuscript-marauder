import {
  Browser,
  launch,
} from "https://github.com/lino-levan/astral/raw/0fd73cf/mod.ts";

import { Orchastrator } from "./mod.ts";

export class AstralOrchastrator implements Orchastrator {
  browser?: Browser;

  async init(proxy?: string) {
    if (proxy) {
      this.browser = await launch({
        args: [
          `--proxy-server=${proxy}`,
        ],
      });
    } else {
      this.browser = await launch();
    }
  }

  async goto_and_evaluate<T, P extends Array<unknown>>(
    url: string,
    func: (...params: P) => T,
    ...args: P
  ): Promise<T> {
    const page = await this.browser?.newPage();
    await page?.goto(url, { waitUntil: "networkidle2" });
    const result = await page?.evaluate(func, { args });
    await page?.close();
    return result;
  }

  async close() {
    await this.browser?.close();
  }
}
