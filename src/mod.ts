import {
  decode as b64Decode,
} from "https://deno.land/std@0.199.0/encoding/base64.ts";
import * as log from "https://deno.land/std@0.199.0/log/mod.ts";

import { Socks5Proxy } from "./proxy.ts";

export interface Orchastrator {
  init(proxy?: string): Promise<void>;
  goto_and_evaluate<T, P extends unknown[]>(
    url: string,
    func: (...params: P) => T,
    ...args: P
  ): Promise<T>;
  close(): Promise<void>;
}

export class Marauder<O extends Orchastrator> {
  orchastrator: O;
  proxy?: Socks5Proxy;

  constructor(orc: O) {
    this.orchastrator = orc;
  }

  async init(proxy?: string) {
    if (proxy) {
      this.proxy = new Socks5Proxy(proxy);
      this.proxy?.start();
      await this.orchastrator.init(this.proxy.url());
    } else {
      await this.orchastrator.init();
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

    console.log("DOI resolved to URL:", doiResponse.url);

    return new URL(doiResponse.url);
  }

  async pdfLinks(doiUrl: URL): Promise<URL[]> {
    let pdfLinks: string[] = await this.orchastrator.goto_and_evaluate(
      doiUrl.toString(),
      () => {
        return Array.from(document.querySelectorAll("a")).map(
          (el) => el?.getAttribute("href"),
        ).filter((v) => v?.includes("pdf"));
      },
      [],
    );

    pdfLinks = pdfLinks?.map((link) => new URL(link, doiUrl).href);
    pdfLinks = [...new Set(pdfLinks)];
    pdfLinks.sort();

    log.debug("DOI page has PDFs:", pdfLinks);

    return pdfLinks.map((link) => new URL(link));
  }

  async downloadPdf(pdfUrl: URL, original: URL): Promise<Uint8Array> {
    const base64Data = await this.orchastrator.goto_and_evaluate(
      original.toString(),
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

        if (resp.headers.get("content-type")?.includes("application/pdf")) {
          return await bufferToBase64(await resp.blob());
        } else {
          return undefined;
        }
      },
      pdfUrl.toString(),
    );
    if (!base64Data) {
      throw new Error("PDF could not be downloaded");
    }
    return b64Decode(base64Data);
  }

  async close() {
    await this.proxy?.end();
    await this.orchastrator.close();
  }
}
