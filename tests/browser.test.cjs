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
      await expect(phone.page.locator(".metrics")).toHaveCount(0);
      const titleBox = await phone.page.locator(".title").boundingBox();
      const buttonBox = await phone.page
        .locator('.top [data-action="newTask"]')
        .boundingBox();
      assert.ok(
        buttonBox.x > titleBox.x &&
          buttonBox.y < titleBox.y + titleBox.height &&
          buttonBox.y + buttonBox.height > titleBox.y,
      );

      await expect(
        phone.page.locator('.top [data-action="newProject"]'),
      ).toHaveCount(0);
      await expect(phone.page.locator('.top [data-action="menu"]')).toHaveCount(
        0,
      );
      await phone.page.locator('.mobile-nav [data-view="settings"]').click();
      await phone.page
        .getByRole("textbox", { name: "New category" })
        .fill("Garden");
      await phone.page
        .getByRole("button", { name: "Add category", exact: true })
        .click();
      await expect(phone.page.locator(".category-list")).toContainText(
        "Garden",
      );
      phone.page.once("dialog", (dialog) => dialog.accept("Outdoors"));
      await phone.page
        .getByRole("button", { name: "Edit Garden", exact: true })
        .click();
      await expect(phone.page.locator(".category-list")).toContainText(
        "Outdoors",
      );
      phone.page.once("dialog", (dialog) => dialog.accept());
      await phone.page
        .getByRole("button", { name: "Remove Outdoors", exact: true })
        .click();
      await expect(phone.page.locator(".category-list")).not.toContainText(
        "Outdoors",
      );
      await phone.page.locator('.mobile-nav [data-view="dashboard"]').click();
      async function checkEditorFits(page) {
        for (const width of [320, 390, 1280]) {
          await page.setViewportSize({ width, height: 844 });
          const layout = await page
            .locator(".editor-dialog")
            .evaluate((dialog) => {
              const form = dialog.querySelector(".form-grid");
              const bounds = form.getBoundingClientRect();
              return {
                overflows: form.scrollWidth > form.clientWidth + 1,
                fieldsFit: [
                  ...form.querySelectorAll("input,select,textarea"),
                ].every((field) => {
                  const rect = field.getBoundingClientRect();
                  return (
                    rect.left >= bounds.left && rect.right <= bounds.right + 1
                  );
                }),
                dialogFits: dialog.scrollWidth <= dialog.clientWidth + 1,
              };
            });
          assert.deepEqual(layout, {
            overflows: false,
            fieldsFit: true,
            dialogFits: true,
          });
          await expect(page.locator('[data-action="save"]')).toBeInViewport();
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      async function add(page, title) {
        await page.locator('[data-action="newTask"]').first().click();
        await page.locator("#f_title").fill(title);
        await checkEditorFits(page);
        const footer = page.locator(".dialog-actions");
        const box = await footer.boundingBox();
        assert.ok(
          box.y >= 0 && box.y + box.height <= 844,
          "Editor actions stay in the viewport",
        );
        await page.locator("#item-form").evaluate((form) => {
          form.scrollTop = form.scrollHeight;
        });
        await expect(page.locator('[data-action="save"]')).toBeInViewport();
        await expect(page.locator("#f_category")).toHaveCount(0);
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
      const completed = phone.page.locator("[data-complete]").first();
      await completed.check();
      await expect(phone.page.locator(".task-completing")).toHaveCount(1);
      await expect(phone.page.locator(".task-completing")).toHaveCount(0);
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );

      await phone.page.locator('.mobile-nav [data-view="projects"]').click();
      await phone.page.locator('[data-action="newProject"]').click();
      await phone.page.locator("#f_name").fill("Garden");
      await checkEditorFits(phone.page);
      await phone.page.locator("#f_shorthand").fill("GRDN");
      await phone.page.locator('[data-action="save"]').click();
      await phone.page.locator("[data-project]").click();
      await expect(
        phone.page.getByRole("button", {
          name: "+ Task in project",
          exact: true,
        }),
      ).toHaveCount(1);
      await phone.page.locator('.top [data-action="newTask"]').click();
      await expect(phone.page.locator("#f_projectId")).toHaveValue(
        await phone.page
          .locator("#f_projectId option", { hasText: "Garden" })
          .getAttribute("value"),
      );
      await phone.page.locator("#f_title").fill("Plant seeds");
      await phone.page.screenshot({
        path: ".build-tools/task-editor-focus.png",
        fullPage: true,
      });
      await phone.page.locator('[data-action="save"]').click();
      await expect(phone.page.locator(".task")).toContainText("GRDN-001");
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );
      const parentId = row.data.tasks.find((t) => t.title === "Plant seeds").id;
      await phone.page.locator('.top [data-action="newTask"]').click();
      await phone.page.locator("#f_title").fill("Water seedlings");
      await phone.page
        .getByText("Parents / prerequisites", { exact: true })
        .click();
      await phone.page
        .locator(`input[name="parents"][value="${parentId}"]`)
        .check();
      await checkEditorFits(phone.page);
      await expect(
        phone.page.locator('.dialog-actions [data-action="close"]'),
      ).toHaveCount(0);
      await expect(
        phone.page.getByRole("button", { name: "Cancel editing", exact: true }),
      ).toHaveCount(1);
      await phone.page.locator("#f_title").focus();
      assert.ok(
        await phone.page
          .locator("#f_title")
          .evaluate((el) => parseInt(getComputedStyle(el).outlineOffset) <= -2),
      );
      await phone.page.locator('[data-action="save"]').click();
      await expect(
        phone.page.locator(".task", { hasText: "Water seedlings" }),
      ).toContainText("Waiting on 1 parent");
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );
      const childId = row.data.tasks.find(
        (t) => t.title === "Water seedlings",
      ).id;
      assert.deepEqual(row.data.tasks.find((t) => t.id === childId).dependsOn, [
        parentId,
      ]);
      await phone.page
        .getByRole("button", { name: "Task flowchart", exact: true })
        .click();
      await expect(phone.page.locator(".flow-node")).toHaveCount(2);
      await expect(phone.page.locator(".flow-edges path")).toHaveCount(1);
      await phone.page.screenshot({
        path: ".build-tools/task-flow-mobile.png",
        fullPage: true,
      });
      await phone.page
        .locator(`.flow-node[data-edit-task="${parentId}"]`)
        .click();
      await phone.page.getByText("Dependent tasks", { exact: true }).click();
      await expect(
        phone.page.locator(`input[name="dependents"][value="${childId}"]`),
      ).toBeChecked();
      await phone.page
        .getByText("Parents / prerequisites", { exact: true })
        .click();
      await phone.page
        .locator(`input[name="parents"][value="${childId}"]`)
        .check();
      phone.page.once("dialog", (d) => {
        assert.match(d.message(), /dependency loop/);
        return d.accept();
      });
      await phone.page.locator('[data-action="save"]').click();
      await expect(
        phone.page.locator("#modal-root .editor-dialog"),
      ).toHaveCount(1);
      await phone.page
        .getByRole("button", { name: "Cancel editing", exact: true })
        .click();
      await phone.page
        .getByRole("button", { name: "Back to project", exact: true })
        .click();
      phone.page.once("dialog", (d) => {
        assert.match(d.message(), /parents first/);
        return d.accept();
      });
      await phone.page.locator(`[data-complete="${childId}"]`).click();
      await expect(
        phone.page.locator(`[data-complete="${childId}"]`),
      ).not.toBeChecked();
      await phone.page.locator(`[data-complete="${parentId}"]`).check();
      await expect(phone.page.locator(".task-completing")).toHaveCount(0);
      await expect(
        phone.page.locator(".task", { hasText: "Water seedlings" }),
      ).not.toContainText("Waiting on");
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );
      await pc.page.locator('[data-cloud-action="account"]').click();
      await pc.page.locator('[data-cloud-action="sync"]').click();
      await pc.page.locator('[data-cloud-action="close"]').click();
      await pc.page.locator('.mobile-nav [data-view="projects"]').click();
      await pc.page.locator("[data-project]").click();
      await pc.page
        .getByRole("button", { name: "Task flowchart", exact: true })
        .click();
      await expect(pc.page.locator(".flow-node")).toHaveCount(2);
      await expect(pc.page.locator(".flow-edges path")).toHaveCount(1);
      await pc.page.setViewportSize({ width: 1280, height: 900 });
      await pc.page.screenshot({
        path: ".build-tools/task-flow-desktop.png",
        fullPage: true,
      });
      await phone.page.locator(`[data-edit-task="${parentId}"]`).click();
      phone.page.once("dialog", (d) => d.accept());
      await phone.page.locator('[data-action="delete"]').click();
      await expect(phone.page.locator("#cloud-root")).toContainText(
        "Saved to cloud",
      );
      assert.deepEqual(
        row.data.tasks.find((t) => t.id === childId).dependsOn,
        [],
      );
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
