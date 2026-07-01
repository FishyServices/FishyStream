import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

async function run() {
  const targetUrl = "https://megaplay.buzz/stream/ani/194317/11/dub?startAt=120";
  console.log(`Fetching: ${targetUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"]
  });

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    // @ts-ignore
    const originalFetch = window.fetch;
    // @ts-ignore
    window.fetch = async function (...args: any[]) {
      console.log("[INJECT-FETCH-REQ]", args[0]);
      // @ts-ignore
      const response = await originalFetch.apply(this, args);
      const clone = response.clone();
      clone
        .text()
        .then((text: string) => {
          if (text.includes("m3u8")) {
            console.log(`[INJECT-FETCH-RES] ${args[0]} contains m3u8!`);
            console.log(`[INJECT-FETCH-BODY] ${text.slice(0, 500)}`);
          } else if (args[0].includes("m3u8") || args[0].includes("nekostream")) {
            console.log(`[INJECT-FETCH-RES] ${args[0]} -> ${text.slice(0, 200)}`);
          }
        })
        .catch((e: any) => console.log("Failed to read clone", e));
      return response;
    };

    // @ts-ignore
    const originalOpen = XMLHttpRequest.prototype.open;
    // @ts-ignore
    XMLHttpRequest.prototype.open = function (...args: any[]) {
      console.log("[INJECT-XHR-REQ]", args[1]);
      // @ts-ignore
      this.addEventListener("load", function () {
        // @ts-ignore
        if (this.responseType === "" || this.responseType === "text") {
          // @ts-ignore
          const text = this.responseText;
          if (typeof text === "string" && text.includes("m3u8")) {
            console.log(`[INJECT-XHR-RES] ${args[1]} contains m3u8!`);
            console.log(`[INJECT-XHR-BODY] ${text.slice(0, 500)}`);
          } else if (
            typeof args[1] === "string" &&
            (args[1].includes("m3u8") || args[1].includes("nekostream"))
          ) {
            console.log(`[INJECT-XHR-RES] ${args[1]} -> ${text.slice(0, 200)}`);
          }
        }
      });
      // @ts-ignore
      return originalOpen.apply(this, args);
    };
  });

  page.on("console", (msg) => {
    const text = msg.text();
    if (text.startsWith("[INJECT")) {
      console.log(text);
    }
  });

  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("nekostream.site") || url.includes("m3u8")) {
      console.log(`[PUPPETEER-RES] ${url} (Type: ${res.headers()["content-type"]})`);
    }
  });

  console.log("Navigating...");
  await page.setExtraHTTPHeaders({
    Referer: "http://localhost:3000/"
  });
  await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });
  console.log("Loaded. Clicking center...");

  const viewport = page.viewport();
  if (viewport) {
    // await page.mouse.click(viewport.width / 2, viewport.height / 2);
  }

  console.log("Waiting 10s...");
  await new Promise((r) => setTimeout(r, 10000));

  console.log("Done.");
  await browser.close();
}

run().catch(console.error);
