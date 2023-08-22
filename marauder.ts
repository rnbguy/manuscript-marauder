import {
  decode as b64Decode,
} from "https://deno.land/std@0.199.0/encoding/base64.ts";
import { signal } from "https://deno.land/std@0.199.0/signal/mod.ts";

import { slugify } from "https://deno.land/x/slugify@0.3.0/mod.ts";
import { Select } from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/select.ts";

export async function processDoiasync(
  { proxy: proxyUrl, debug, stealth, paginate }: {
    proxy: string;
    debug?: boolean;
    stealth?: boolean;
    paginate?: number;
  },
  doi: string,
): Promise<Uint8Array> {
  const url = `https://doi.org/${doi}`;

  const doiResponse = await fetch(url, {
    method: "HEAD", // Using HEAD to get only headers without body
  });

  if (!doiResponse.redirected) {
    throw new Error(`DOI could not be resolved: ${doiResponse}`);
  }

  console.log("DOI resolved to URL:", doiResponse.url);

  let sshProxyProcess: Deno.ChildProcess | null = null;

  if (proxyUrl.startsWith("ssh://")) {
    // TODO: spwan socks5 proxy
    // ssh -4NTD 1234 -o ExitOnForwardFailure=yes <user@host>

    sshProxyProcess = new Deno.Command("ssh", {
      args: [
        "-4NTD",
        "1234",
        "-o",
        "ExitOnForwardFailure=yes",
        proxyUrl.replace("ssh://", ""),
      ],
    }).spawn();

    proxyUrl = "socks5://localhost:1234";
  }

  const puppeteer =
    (stealth
      ? await import("npm:puppeteer-extra")
      : await import("npm:puppeteer")).default;

  if (stealth) {
    await import("npm:puppeteer");
    const stealthPlugin = await import("npm:puppeteer-extra-plugin-stealth");
    puppeteer.use(stealthPlugin.default());
  }

  const browser = await puppeteer.launch({
    executablePath: "google-chrome-stable",
    headless: debug ? false : "new",
    args: [
      `--proxy-server=${proxyUrl}`,
    ],
  });

  const page = await browser.newPage();

  try {
    //Allow JS.
    await page.setJavaScriptEnabled(true);

    await page.goto(doiResponse.url, {
      waitUntil: "domcontentloaded",
    });

    let pdfLinks = await page.$$eval(
      "*",
      (els) =>
        els.map((el) =>
          el.getAttributeNames().map((a) => el.getAttribute(a)).filter((
            v: string,
          ) => v.includes("pdf") && v.includes("/"))
        ).flat(),
    );

    pdfLinks = pdfLinks.map((link) =>
      new URL(link, new URL(doiResponse.url)).href
    );

    pdfLinks = [...new Set(pdfLinks)];

    let downloadLink: string;

    if (paginate !== undefined) {
      if (paginate >= pdfLinks.length) {
        throw new Error(
          "Paginate value is greater than the number of PDF links.",
        );
      }
      downloadLink = pdfLinks[paginate];
    } else {
      if (pdfLinks.length === 1) {
        downloadLink = pdfLinks[0];
      } else {
        downloadLink = await Select.prompt({
          message: "Pick a link to download:",
          options: pdfLinks,
        });
      }
    }

    const base64Data = await page.evaluate(
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
      downloadLink,
    );

    const pdfName = `${slugify(doi)}.pdf`;

    const pdfData = b64Decode(base64Data);

    await Deno.writeFile(pdfName, pdfData);
    console.log("Saved at:", pdfName);
    if (debug) {
      console.log("waiting for interrupt signal..");
      const sig = signal("SIGINT");
      for await (const _ of sig) {
        console.log("interrupt signal received");
        break;
      }
    }

    return pdfData;
  } finally {
    await page.close();
    await browser.close();
    if (sshProxyProcess) {
      sshProxyProcess.kill("SIGINT");
    }
    console.log("resources are freed.");
  }
}
