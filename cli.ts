#!/usr/bin/env -S deno run --unstable -A

import * as log from "https://deno.land/std@0.199.0/log/mod.ts";

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.3/command/mod.ts";
import { Select } from "https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/select.ts";

import { slugify } from "https://deno.land/x/slugify@0.3.0/mod.ts";

import { MarauderAstral as Marauder } from "./src/mod.ts";

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
  .option(
    "-o --output <output:string>",
    "Output file name. Defaults to <doi>.pdf",
  )
  .action(
    async ({ proxy, output }, doi: string) => {
      const marauder = new Marauder();

      try {
        await marauder.init(
          proxy,
        );

        const doiLink = await marauder.resolveDoiLink(doi);

        log.info(`DOI link: ${doiLink}`);

        const pdfLinks = await marauder.pdfLinks(doiLink);

        log.info(`PDF links: ${pdfLinks}`);

        let pdfLink: string;

        if (pdfLinks.length === 0) {
          throw new Error("No PDF links found");
        } else if (pdfLinks.length === 1) {
          pdfLink = pdfLinks[0].href;
        } else {
          pdfLink = await Select.prompt({
            message: "Select PDF",
            options: pdfLinks.map((v) => v.href),
          });
        }

        log.info(`Downloading ${pdfLink}`);

        const pdfData = await marauder.downloadPdf(new URL(pdfLink), doiLink);

        if (output) {
          await Deno.writeFile(output, pdfData);
        } else {
          const pdfName = `${slugify(doi)}.pdf`;
          await Deno.writeFile(pdfName, pdfData);
        }
      } finally {
        marauder.close();
      }
    },
  );

await log.setup({
  handlers: {
    console: new log.handlers.ConsoleHandler("DEBUG"),
  },

  loggers: {
    tasks: {
      level: "ERROR",
      handlers: ["console"],
    },
  },
});

await command.parse(Deno.args);
