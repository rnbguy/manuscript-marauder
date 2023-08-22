import { signal } from "https://deno.land/std/signal/mod.ts";

import "https://deno.land/std/dotenv/load.ts";

import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { slugify } from "https://deno.land/x/slugify@0.3.0/mod.ts";

import { processDoiasync } from "./marauder.ts";

const books = new Map<string, any>();
books.set("1", {
  id: "1",
  title: "The Hound of the Baskervilles",
  author: "Conan Doyle, Arthur",
});

const router = new Router();
router
  .get("/", (context) => {
    const url = new URL(context.request.url);
    context.response.body = [
      `Usage: https://${url.host}/:doi/:paginate?`,
      `  Sometimes resolved DOI page may have multiple pdfs.`,
      `  Use paginate to get the n-th pdf.`,
      `  Paginate index starts from and defaults at 0 i.e. the first pdf.`,
      `  So https://${url.host}/:doi may not fetch what you're looking for.`,
      `  In that case, try https://${url.host}/:doi/1 or https://${url.host}/:doi/2 or ...`,
      `Example:`,
      `  https://${url.host}/10.48550/arXiv.2302.13971`,
      `  https://${url.host}/10.48550/arXiv.2302.13971/0`,
    ].join("\n");
  })
  .get("/:prefix/:suffix/:paginate?", async (context) => {
    const doi = `${context?.params?.prefix}/${context?.params?.suffix}`;
    const paginate = parseInt(context?.params?.paginate ?? "0");

    try {
      const buffer = await processDoiasync({
        proxy: Deno.env.get("PROXY") ?? "socks5://localhost:1234",
        stealth: true,
        paginate,
      }, doi);
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
