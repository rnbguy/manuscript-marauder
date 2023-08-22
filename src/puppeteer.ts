import {
  decode as b64Decode,
} from "https://deno.land/std@0.199.0/encoding/base64.ts";
import * as log from "https://deno.land/std@0.199.0/log/mod.ts";

import { Browser } from "npm:puppeteer";
import { default as puppeteer } from "npm:puppeteer-extra";
import StealthPlugin from "npm:puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

import { Socks5Proxy } from "./mod.ts";

export class MarauderPuppeteer {
  browser: Browser | null = null;
  proxy?: Socks5Proxy;

  async init(proxy: string) {
    if (proxy) {
      this.proxy = new Socks5Proxy(proxy);
      this.browser = await puppeteer.launch({
        executablePath: "google-chrome-stable",
        headless: "new",
        args: [
          `--proxy-server=${this.proxy.proxyUrl()}`,
        ],
      });
      this.proxy?.start();
    } else {
      this.browser = await puppeteer.launch({
        executablePath: "google-chrome-stable",
        headless: "new",
      });
    }
  }

  async resolveDoiLink(doi: string): Promise<URL> {
    const url = `https://doi.org/${doi}`;

    const doiResponse = await fetch(url, {
      method: "HEAD", // Using HEAD to get only headers without body
    });

    if (!doiResponse.redirected) {
      throw new Error(`DOI could not be resolved: ${doiResponse}`);
    }

    log.debug("DOI resolved to URL:", doiResponse.url);

    return new URL(doiResponse.url);
  }

  async pdfLinks(doiUrl: URL): Promise<URL[]> {
    const page = await this.browser?.newPage();
    await page?.setJavaScriptEnabled(true);

    await page?.goto(doiUrl.toString(), {
      waitUntil: "networkidle2",
    });

    let pdfLinks = await page?.evaluate(() => {
      return Array.from(document.querySelectorAll("a")).map(
        (el) => el?.getAttribute("href"),
      ).filter((v) => v?.includes("pdf"));
    });

    await page?.close();
    pdfLinks = pdfLinks?.map((link) => new URL(link, doiUrl).href);
    pdfLinks = [...new Set(pdfLinks)];
    pdfLinks.sort();

    log.debug("DOI page has PDFs:", pdfLinks);

    return pdfLinks.map((link) => new URL(link));
  }

  async downloadPdf(pdfUrl: URL, original: URL): Promise<Uint8Array> {
    const page = await this.browser?.newPage();

    await page?.goto(original.toString(), { waitUntil: "networkidle2" });

    const base64Data = await page?.evaluate(
      async (downloadUrl: string) => {
        const resp = await fetch(downloadUrl, { credentials: "include" });

        // puppeteer's page.evaluate() runs in browser context
        // and communicates via json-serializable values
        // we need to convert the response body to a base64 string

        // fastest browser native solution to convert large binary data to base64
        // https://stackoverflow.com/a/66046176

        async function bufferToBase64(blob: Blob) {
          // use a FileReader to generate a base64 data URI:
          const base64url: string = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
          return base64url.substring(base64url.indexOf(",") + 1);
        }
        return await bufferToBase64(await resp.blob());
      },
      pdfUrl.toString(),
    );
    await page?.close();
    return b64Decode(base64Data);
  }

  async close() {
    await this.proxy?.end();
    await this.browser?.close();
  }
}
