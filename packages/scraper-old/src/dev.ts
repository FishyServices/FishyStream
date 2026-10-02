import app from "./index";
import puppeteer from "puppeteer";

export default {
  port: 4000,
  fetch(req: Request) {
    return app.fetch(req, {
      MYBROWSER: null,
      launchBrowser: () =>
        puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-web-security"]
        })
    });
  }
};
