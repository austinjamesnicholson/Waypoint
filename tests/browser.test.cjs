const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium, expect } = require("@playwright/test");
const executablePath =
  process.env.WAYPOINT_CHROME ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : chromium.executablePath());
test(
  "browser: sign-in, two-device sync, offline queue, and sign-out isolation",
  { skip: !fs.existsSync(executablePath) },
  async () => {
    const root = path.resolve(".");
    const server = http.createServer((req, res) => {
      const file = path.resolve(
        root,
        "." +
          new URL(req.url, "http://localhost").pathname.replace(
            /\/$/,
            "/index.html",
          ),
      );
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      const ext = path.extname(file);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
        }[ext] || "text/plain",
      );
      res.end(fs.readFileSync(file));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    let browser;
    try {
      browser = await chromium.launch({ executablePath, headless: true });
      const origin = `http://127.0.0.1:${server.address().port}`;
      const user = {
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        aud: "authenticated",
      };
      const token =
        Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
          "base64url",
        ) +
        "." +
        Buffer.from(
          JSON.stringify({
            sub: user.id,
            exp: Math.floor(Date.now() / 1000) + 3600,
            role: "authenticated",
          }),
        ).toString("base64url") +
        ".test";
      let row = null;
      async function device() {
        const context = await browser.newContext({
          serviceWorkers: "block",
          viewport: { width: 390, height: 844 },
        });
        await context.route("**/js/config.js", (route) =>
          route.fulfill({
            contentType: "text/javascript",
            body: 'window.WAYPOINT_CONFIG={supabaseUrl:"https://waypoint-test.supabase.co",supabasePublishableKey:"sb_publishable_test"};',
          }),
        );
        await context.route(
          "https://waypoint-test.supabase.co/**",
          async (route) => {
            const request = route.request(),
              url = new URL(request.url());
            let body = {},
              status = 200;
            if (url.pathname === "/auth/v1/token")
              body = {
                access_token: token,
                refresh_token: "test-refresh",
                expires_in: 3600,
                token_type: "bearer",
                user,
              };
            else if (url.pathname === "/auth/v1/user") body = user;
            else if (url.pathname === "/rest/v1/waypoint_documents") body = row;
            else if (url.pathname === "/rest/v1/rpc/save_waypoint_document") {
              const args = request.postDataJSON();
              if ((row?.revision || 0) !== args.expected_revision) {
                status = 409;
                body = { code: "40001", message: "Conflict" };
              } else
                body = row = {
                  revision: args.expected_revision + 1,
                  data: args.document,
                };
            }
            await route.fulfill({
              status,
              contentType: "application/json",
              headers: { "access-control-allow-origin": "*" },
              body: JSON.stringify(body),
            });
          },
        );
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin);
        await page.locator('[data-cloud-action="account"]').click();
        await page.locator("#cloud-email").fill(user.email);
        await page.locator("#cloud-password").fill("password123");
        await page.locator('#cloud-auth-form button[type="submit"]').click();
        await expect(page.locator("#cloud-root")).toContainText(
          "Saved to cloud",
        );
        return { page, context, errors };
      }
      const phone = await device(),
        pc = await device();
      async function add(page, title) {
        await page.locator('[data-action="newTask"]').first().click();
        await page.locator("#f_title").fill(title);
        await page.locator("#f_category").selectOption("Home");
        await page.locator('[data-action="save"]').click();
      }
      await add(phone.page, "From phone");
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );
      await pc.page.locator('[data-cloud-action="account"]').click();
      await pc.page.locator('[data-cloud-action="sync"]').click();
      await expect(pc.page.locator("#app")).toContainText("From phone");
      await pc.page.locator('[data-cloud-action="close"]').click();
      await phone.context.setOffline(true);
      await add(phone.page, "Offline idea");
      await expect(phone.page.locator("#cloud-root")).toContainText("Offline");
      await phone.context.setOffline(false);
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );
      assert.equal(row.data.tasks.length, 2);
      await phone.page.reload();
      await expect(phone.page.locator("#app")).toContainText("Offline idea");
      await phone.page.locator('[data-cloud-action="account"]').click();
      await phone.page.locator('[data-cloud-action="signout"]').click();
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Local only",
      );
      await expect(phone.page.locator("#app")).not.toContainText("From phone");
      assert.deepEqual(phone.errors, []);
      assert.deepEqual(pc.errors, []);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
