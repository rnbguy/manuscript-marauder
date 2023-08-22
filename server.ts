import { signal } from "https://deno.land/std/signal/mod.ts";

import "https://deno.land/std/dotenv/load.ts";

import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { slugify } from "https://deno.land/x/slugify@0.3.0/mod.ts";

import { MarauderPuppeteer as Marauder } from "./src/mod.ts";

const marauder = new Marauder();
await marauder.init(
  Deno.env.get("PROXY") ?? "socks5://localhost:1234",
);

const router = new Router();

router
  .get("/", (context) => {
    const url = new URL(context.request.url);
    context.response.body = [
      `Usage:`,
      `  https://${url.host}/:doi`,
      `Example:`,
      `  https://${url.host}/10.48550/arXiv.2302.13971`,
      ``,
      `Usage:`,
      `  https://${url.host}/:doi/list`,
      `Description:`,
      `  Sometimes resolved DOI page may have multiple PDFs.`,
      `  Use /:doi/list to get the list of PDFs.`,
      `Example:`,
      `  https://${url.host}/10.48550/arXiv.2302.13971/list`,
      ``,
      `Usage:`,
      `  https://${url.host}/:doi/:paginate?`,
      `Description:`,
      `  Use /:doi/:paginate? to get the n-th PDF.`,
      `  Paginate index starts from and defaults at 0 i.e. the first PDF.`,
      `  If https://${url.host}/:doi or https://${url.host}/:doi/0 is not what you're looking for,`,
      `  Try https://${url.host}/:doi/1 or https://${url.host}/:doi/2 or ...`,
      `Example:`,
      `  https://${url.host}/10.48550/arXiv.2302.13971/0`,
      `  https://${url.host}/10.48550/arXiv.2302.13971/1`,
    ].join("\n");
  })
  .get("/:prefix/:suffix/list", async (context) => {
    const doi = `${context?.params?.prefix}/${context?.params?.suffix}`;

    try {
      const doiUrl = await marauder.resolveDoiLink(doi);
      const pdfLinks = await marauder.pdfLinks(doiUrl);

      context.response.headers.set("Content-Type", "application/json");
      context.response.body = Object.fromEntries(
        pdfLinks.map((v, i) => [i, v]),
      );
    } catch (e) {
      console.log(e);
      context.response.body = e.message;
      context.response.status = 500;
    }
  })
  .get("/:prefix/:suffix/:paginate?", async (context) => {
    const doi = `${context?.params?.prefix}/${context?.params?.suffix}`;
    const paginate = parseInt(context?.params?.paginate ?? "0");

    try {
      const doiUrl = await marauder.resolveDoiLink(doi);
      const pdfLinks = await marauder.pdfLinks(doiUrl);

      if (paginate >= pdfLinks.length) {
        throw new Error(`paginate index out of range`);
      }

      const buffer = await marauder.downloadPdf(
        pdfLinks[paginate],
        doiUrl,
      );

      context.response.headers.set("Content-Type", "application/pdf");
      // context.response.headers.set('Content-Disposition', `attachment; filename="${slugify(doiId)}.pdf"`);
      context.response.headers.set(
        "Content-Disposition",
        `inline; filename="${slugify(doi)}.pdf"`,
      );

      context.response.body = buffer;
    } catch (e) {
      console.log(e);
      context.response.body = e.message;
      context.response.status = 500;
    }
  });

const app = new Application();
app.use(router.routes());
app.use(router.allowedMethods());

const controller = new AbortController();

const listenPromise = app.listen({
  hostname: Deno.env.get("SERVER_HOST") ?? "localhost",
  port: parseInt(Deno.env.get("SERVER_PORT") ?? "8000"),
  signal: controller.signal,
});

const signals = signal("SIGINT");

for await (const _ of signals) {
  controller.abort();
  console.log("aborting...");
  break;
}

signals.dispose();

await listenPromise;
