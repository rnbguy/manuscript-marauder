#!/usr/bin/env -S deno run --unstable -A

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";

import { processDoiasync } from "./marauder.ts";

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
  .option("-s --stealth [stealth:boolean]", "Use Puppeteer Stealth plugin.")
  .option("-d --debug [debug:boolean]", "Set headless mode to false.")
  .option("-p --paginate <paginate:number>", "Paginate PDFs.", { default: 0 })
  .action(
    async ({ proxy: proxyUrl, debug, stealth, paginate }, doi: string) => {
      await processDoiasync({ proxy: proxyUrl, debug, stealth, paginate }, doi);
    },
  );

await command.parse(Deno.args);
