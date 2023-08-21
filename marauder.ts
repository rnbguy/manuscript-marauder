#!/usr/bin/env -S deno run --unstable -A

import {
  decode as b64Decode,
} from "https://deno.land/std@0.199.0/encoding/base64.ts";
import { signal } from "https://deno.land/std@0.199.0/signal/mod.ts";

import { Select } from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/select.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { slugify } from "https://deno.land/x/slugify@0.3.0/mod.ts";

import * as node_url from "node:url";

const command = new Command()
  .name("marauder")
  .version("0.1.0")
  .arguments("<doi:string>")
  .option(
    "-p --proxy <proxy:string>",
    "Proxy server to use. Accepts ssh://<user@host> for `ssh -NTD 1234 user@host`.",
    {
      default: "socks5://localhost:1234",
    },
  )
  .option("-s --stealth", "Use Puppeteer Stealth plugin.")
  .option("-d --debug", "Set headless mode to false.")
  .action(async ({ proxy: proxyUrl, debug, stealth }, doi) => {
    const url = `https://doi.org/${doi}`;

    const doiResponse = await fetch(url, {
      method: "HEAD", // Using HEAD to get only headers without body
    });

    if (!doiResponse.redirected) {
      console.log("DOI could not be resolved:", doiResponse);
    }

    console.log("DOI resolved to URL:", doiResponse.url);

    let sshProxyProcess: Deno.ChildProcess | null = null;

    if (proxyUrl.startsWith("ssh://")) {
      // TODO: spwan socks5 proxy
      // ssh -NTD 1234 -o ExitOnForwardFailure=yes <user@host>

      sshProxyProcess = new Deno.Command("ssh", {
        args: [
          "-NTD",
          "1234",
          "-o",
          "ExitOnForwardFailure=yes",
          proxyUrl.replace("ssh://", ""),
        ],
      }).spawn();

      proxyUrl = "socks5://localhost:1234";
    }

    const puppeteer = (stealth
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

    //Allow JS.
    await page.setJavaScriptEnabled(true);

    await page.goto(doiResponse.url, {
      waitUntil: "domcontentloaded",
    });

    let pdfLinks = await page.$$eval(
      "*",
      (els) =>
        els.map((el) =>
          el.getAttributeNames().map((a) =>
            el.getAttribute(a)
          ).filter((
            v: string,
          ) => v.includes("pdf") && v.includes("/"))
        ).flat(),
    );

    pdfLinks = pdfLinks.map((link) => node_url.resolve(doiResponse.url, link));

    pdfLinks = [...new Set(pdfLinks)];

    let downloadLink: string;

    if (pdfLinks.length === 1) {
      downloadLink = pdfLinks[0];
    } else {
      downloadLink = await Select.prompt({
        message: "Pick a link to download:",
        options: pdfLinks,
      });
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

    await Deno.writeFile(pdfName, b64Decode(base64Data));
    console.log("Saved at:", pdfName);

    if (sshProxyProcess) {
      sshProxyProcess.kill("SIGINT");
    }

    if (debug) {
      console.log("waiting for interrupt signal..");
      const sig = signal("SIGINT");
      for await (const _ of sig) {
        console.log("interrupt signal received");
        break;
      }
    }

    await page.close();
    await browser.close();
  });

await command.parse(Deno.args);
