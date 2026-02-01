import { Hono } from "hono";
import puppeteer from "puppeteer";

const app = new Hono();

interface ScreenshotRequest {
  url: string;
  zoom?: number;
}

app.get("/", (c) => {
  return c.json({
    message: "Screenshot Service",
    usage: "POST /screenshot with JSON body: { url: string, zoom?: number }",
    returns: "jpeg image"
  });
});

app.post("/screenshot", async (c) => {
  let body: ScreenshotRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { url, zoom = 1.0 } = body;

  if (!url) {
    return c.json({ error: "Missing 'url' in request body" }, 400);
  }

  try {
    new URL(url);
  } catch {
    return c.json({ error: "Invalid URL format" }, 400);
  }

  if (typeof zoom !== "number" || zoom <= 0 || zoom > 5) {
    return c.json({ error: "Zoom must be a number between 0 and 5" }, 400);
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 3024, height: 1964 });
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    if (zoom !== 1.0) {
      await page.evaluate((zoomLevel: number) => {
        document.body.style.zoom = String(zoomLevel);
      }, zoom);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const screenshot = await page.screenshot({
      type: "jpeg",
      quality: 90,
    });

    await browser.close();

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Screenshot captured`);
    console.log(`[${timestamp}] URL: ${url}`);
    console.log(`[${timestamp}] Zoom: ${zoom}`);

    return new Response(screenshot.buffer.slice(screenshot.byteOffset, screenshot.byteOffset + screenshot.byteLength) as ArrayBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": 'attachment; filename="screenshot.jpeg"',
      },
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error("Screenshot error:", error);
    return c.json({ error: "Failed to capture screenshot" }, 500);
  }
});

const server = Bun.serve({
  port: 3020,
  fetch: app.fetch,
});

console.log(`Screenshot service running on http://localhost:${server.port}`);
