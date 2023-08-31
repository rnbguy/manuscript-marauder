import { Browser } from "npm:puppeteer";
import { default as puppeteer } from "npm:puppeteer-extra";
import StealthPlugin from "npm:puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

import { Orchastrator } from "./mod.ts";

export class PuppeteerOrchatrator implements Orchastrator {
  browser?: Browser;

  async init(proxy: string) {
    if (proxy) {
      this.browser = await puppeteer.launch({
        executablePath: "google-chrome-stable",
        headless: "new",
        args: [
          `--proxy-server=${proxy}`,
        ],
      });
    } else {
      this.browser = await puppeteer.launch({
        executablePath: "google-chrome-stable",
        headless: "new",
      });
    }
  }

  async finalUrl(url: string): Promise<string> {
    const page = await this.browser?.newPage();
    await page?.setJavaScriptEnabled(true);
    page?.goto(url, { waitUntil: "networkidle2" });
    const result = page?.url();
    await page?.close();
    return result as string;
  }

  async gotoAndEvaluate<T, P extends Array<unknown>>(
    url: string,
    func: (...params: P) => T,
    ...args: P
  ): Promise<T> {
    const page = await this.browser?.newPage();
    await page?.setJavaScriptEnabled(true);
    await page?.goto(url, { waitUntil: "networkidle2" });
    const result = await page?.evaluate(func, ...args);
    await page?.close();
    return result as T;
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
