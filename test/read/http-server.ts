import { readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeReportDocx, makeReportPdf } from "../fixtures/read/make-fixtures.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "read");

export interface FixtureServer {
  url(p: string): string;
  /** One "METHOD /path" entry per request, in arrival order. */
  requests: string[];
  close(): Promise<void>;
}

const CAFE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<title>Café</title>
</head>
<body>
<main>
<article>
<h1>Café</h1>
<p>Our café serves a short menu every day of the week, and the dessert of the house is a Crème brûlée made with fresh vanilla, slow cooked eggs and a thin layer of caramel on top.</p>
<p>The kitchen opens at eight in the morning and closes after the last order of the evening, so guests can stop by for breakfast, lunch or a late coffee with friends.</p>
</article>
</main>
</body>
</html>
`;

export async function startFixtureServer(): Promise<FixtureServer> {
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const p = (req.url ?? "/").split("?")[0]!;
    requests.push(`${req.method} ${p}`);
    void handle(p, res);
  });
  async function handle(p: string, res: http.ServerResponse): Promise<void> {
    switch (p) {
      case "/article":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(path.join(FIXTURES, "article.html")));
        return;
      case "/moved":
        res.writeHead(302, { location: "/article" });
        res.end();
        return;
      case "/cafe":
        res.writeHead(200, { "content-type": "text/html; charset=windows-1252" });
        res.end(Buffer.from(CAFE_HTML, "latin1"));
        return;
      case "/app":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(await readFile(path.join(FIXTURES, "app-shell.html")));
        return;
      case "/notes.txt":
        res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
        res.end(await readFile(path.join(FIXTURES, "notes.md")));
        return;
      case "/export":
        res.writeHead(200, { "content-type": "text/csv; charset=utf-8" });
        res.end(await readFile(path.join(FIXTURES, "table.csv")));
        return;
      case "/slow":
        return; // never answers
      case "/big":
        res.writeHead(200, { "content-type": "text/plain", "content-length": "2048" });
        res.end(Buffer.alloc(2048, 0x61));
        return;
      case "/stream":
        res.writeHead(200, { "content-type": "text/plain" });
        for (let i = 0; i < 4; i++) res.write(Buffer.alloc(1024, 0x62));
        res.end();
        return;
      case "/gone":
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("gone");
        return;
      case "/logo":
        res.writeHead(200, { "content-type": "image/png" });
        res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        return;
      case "/report.pdf":
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end(Buffer.from(makeReportPdf()));
        return;
      case "/files/report.pdf":
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(Buffer.from(makeReportPdf()));
        return;
      case "/report":
        res.writeHead(200, { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        res.end(Buffer.from(makeReportDocx()));
        return;
      default:
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
    }
  }
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: (p) => `http://127.0.0.1:${port}${p}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
