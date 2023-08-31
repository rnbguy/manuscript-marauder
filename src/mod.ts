import {
  decode as b64Decode,
} from "https://deno.land/std@0.200.0/encoding/base64.ts";
import * as log from "https://deno.land/std@0.200.0/log/mod.ts";

import { Socks5Proxy } from "./proxy.ts";

export interface Orchastrator {
  init(proxy?: string): Promise<void>;
  finalUrl(url: string): Promise<string>;
  gotoAndEvaluate<T, P extends Array<unknown>>(
    url: string,
    func: (...params: P) => T,
    ...args: P
  ): Promise<T>;
  gotoAndContent(url: string): Promise<string>;
  close(): Promise<void>;
}

function getAllUrl(obj: unknown): Array<string> {
  if (typeof obj === "string") {
    if (obj.startsWith("http://") || obj.startsWith("https://")) {
      return [obj];
    }
  } else if (Array.isArray(obj)) {
    return obj.flatMap(getAllUrl);
  } else if (typeof obj === "object") {
    return Object.values(obj).flatMap(getAllUrl);
  }
  return [];
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

    log.debug("DOI resolved to URL:", doiResponse.url);

    return new URL(doiResponse.url);
  }

  async pdfLinks(doi: string): Promise<Array<URL>> {
    const doiUrl = await this.resolveDoiLink(doi);
    let pdfLinks: Array<string> = await this.orchastrator.gotoAndEvaluate(
      doiUrl.toString(),
      () => {
        // sometimes the links are stored under different elemenets and attributes
        // iterating over all elements and attributes

        return Array.from(document.querySelectorAll("*")).map((el) =>
          el.getAttributeNames().map((a: string) => el.getAttribute(a)).filter((
            v: string,
          ) => v.includes("pdf") && v.includes("/"))
        ).flat();
      },
    );

    pdfLinks = pdfLinks?.map((link) => new URL(link, doiUrl).href);
    pdfLinks = [...new Set(pdfLinks)];
    pdfLinks.sort();

    log.debug("DOI page has PDFs:", pdfLinks);

    return pdfLinks.map((link) => new URL(link));
  }

  async resolveDoiLinkNew(doi: string): Promise<URL> {
    const resp = await fetch(`https://doi.org/api/handles/${doi}`);
    const data = await resp.json();
    const url = data.values.filter((v: { type: string }) => v.type === "URL")[0]
      .data.value
      .replace("http://", "https://");
    return new URL(url);
  }

  async pdfLinksNew(doi: string): Promise<Array<URL>> {
    const resp = await fetch(`https://dx.doi.org/${doi}`, {
      headers: {
        Accept: "application/vnd.citationstyles.csl+json",
      },
    });

    const data = await resp.json();
    console.log(data);
    const allUrls = [...new Set(getAllUrl(data))];
    console.log("allUrls", allUrls);
    const allPdfs = allUrls.filter((url) => url.includes("pdf")).map((url) =>
      url.replace("http://", "https://")
    ).map((url) => new URL(url));
    console.log(allPdfs);
    return allPdfs;
  }

  async downloadPdf(doi: string, pdfUrl: URL): Promise<Uint8Array> {
    const doiUrl = await this.resolveDoiLink(doi);

    const base64Data = await this.orchastrator.gotoAndEvaluate(
      doiUrl.toString(),
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
