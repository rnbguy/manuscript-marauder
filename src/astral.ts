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

  async finalUrl(url: string): Promise<string> {
    const page = await this.browser?.newPage();
    await page?.goto(url, { waitUntil: "networkidle2" });
    const result = page?.url;
    await page?.close();
    return result as string;
  }

  async gotoAndEvaluate<T, P extends Array<unknown>>(
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

  async gotoAndContent(url: string): Promise<string> {
    const page = await this.browser?.newPage();
    await page?.goto(url, { waitUntil: "networkidle2" });
    const result = await page?.content();
    await page?.close();
    return result as string;
  }

  async close() {
    await this.browser?.close();
  }
}
