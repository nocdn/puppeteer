import { Hono } from "hono";
import puppeteer from "puppeteer";

const app = new Hono();

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface ScreenshotRequest {
  url: string;
  zoom?: number;
}

app.get("/", (c) => {
  return c.json({
    message: "Screenshot Service",
    endpoints: [
      {
        method: "POST",
        path: "/screenshot",
        body: "{ url: string, zoom?: number }",
        returns: "jpeg image",
      },
      {
        method: "POST",
        path: "/og",
        body: "{ url: string }",
        query: "?metadata=true (optional, returns JSON instead of image)",
        returns: "og image binary (or JSON with ?metadata=true)",
      },
    ],
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
    await page.setUserAgent(USER_AGENT);
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

interface OgRequest {
  url: string;
}

app.post("/og", async (c) => {
  let body: OgRequest;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { url } = body;

  if (!url) {
    return c.json({ error: "Missing 'url' in request body" }, 400);
  }

  try {
    new URL(url);
  } catch {
    return c.json({ error: "Invalid URL format" }, 400);
  }

  const metadataOnly = c.req.query("metadata") === "true";

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
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Extract OG image URL with fallback chain
    const ogImageUrl = await page.evaluate(() => {
      const selectors = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
        'meta[property="twitter:image"]',
      ];

      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          const content = el.getAttribute("content");
          if (content) return content;
        }
      }

      return null;
    });

    await browser.close();

    if (!ogImageUrl) {
      return c.json({ error: "No OG image found on this page" }, 404);
    }

    // Resolve relative URLs against the page URL
    const resolvedUrl = new URL(ogImageUrl, url).href;

    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] OG image extracted`);
    console.log(`[${timestamp}] Page: ${url}`);
    console.log(`[${timestamp}] OG Image: ${resolvedUrl}`);

    // If metadata-only mode, return the URL as JSON
    if (metadataOnly) {
      return c.json({ url: resolvedUrl });
    }

    // Fetch the image and proxy it back
    const imageResponse = await fetch(resolvedUrl);

    if (!imageResponse.ok) {
      return c.json(
        { error: "Failed to fetch OG image", imageUrl: resolvedUrl },
        502
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    return new Response(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'inline; filename="og-image"',
        "X-OG-Image-URL": resolvedUrl,
      },
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error("OG extraction error:", error);
    return c.json({ error: "Failed to extract OG image" }, 500);
  }
});

const server = Bun.serve({
  port: 3020,
  fetch: app.fetch,
});

console.log(`Screenshot service running on http://localhost:${server.port}`);
