import puppeteer from "puppeteer";

class AternosController {
  constructor(username, password, serverName = null, debug = false) {
    this.username = username;
    this.password = password;
    this.serverName = serverName;
    this.debug = debug;
    this.browser = null;
    this.page = null;
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true,
      executablePath: "/usr/bin/google-chrome-stable",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-features=IsolateOrigins",
        "--disable-site-isolation-trials",
        "--window-size=1920,1080",
        "--single-process",
        "--no-zygote",
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });

    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
  }
  async login() {
    try {
      console.log("Navigating to Aternos login page...");
      await this.page.goto("https://aternos.org/go/", {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      await this.delay(2000);

      try {
        const cookieButton = await this.page.$(
          ".fc-cta-consent, .fc-button-label"
        );
        if (cookieButton) {
          console.log("Accepting cookies...");
          await cookieButton.click();
          await this.delay(1000);
        }
      } catch (e) {
        console.log("No cookie banner or already accepted");
      }

      console.log("Looking for login form...");

      await this.page.waitForSelector("input", { timeout: 15000 });
      await this.delay(1000);

      console.log("Entering username...");
      const usernameEntered = await this.page.evaluate((username) => {
        let input = document.querySelector('input[type="text"]');
        if (!input) input = document.querySelector('input[name*="user" i]');
        if (!input)
          input = document.querySelector('input[placeholder*="user" i]');
        if (!input) {
          const inputs = Array.from(document.querySelectorAll("input"));
          input = inputs.find(
            (i) =>
              i.type === "text" ||
              i.type === "" ||
              (!i.type && i.name !== "password")
          );
        }

        if (input) {
          input.focus();
          input.value = username;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
        return false;
      }, this.username);

      if (!usernameEntered) {
        throw new Error("Could not find username field");
      }
      await this.delay(500);

      const passwordSelector = await this.page.waitForSelector(
        'input[type="password"], input[name="password"], .login-password input, #password',
        { timeout: 10000, visible: true }
      );

      if (!passwordSelector) {
        throw new Error("Could not find password field");
      }

      console.log("Entering password...");
      await passwordSelector.click({ clickCount: 3 });
      await passwordSelector.type(this.password, { delay: 100 });
      await this.delay(500);

      console.log("Clicking login button...");

      await this.page.waitForSelector('button, input[type="submit"]', {
        timeout: 10000,
      });

      const loginClicked = await this.page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll(
            'button, input[type="submit"], input[type="button"]'
          )
        );
        const loginBtn = buttons.find((btn) => {
          const text = (btn.textContent || btn.value || "").toLowerCase();
          return text.includes("login") || text.includes("log in");
        });

        if (loginBtn) {
          loginBtn.click();
          return true;
        }

        const form = document.querySelector("form");
        if (form) {
          form.submit();
          return true;
        }

        return false;
      });

      if (!loginClicked) {
        throw new Error("Could not find or click login button");
      }

      console.log("Waiting for login to complete...");
      await Promise.race([
        this.page.waitForNavigation({
          waitUntil: "networkidle0",
          timeout: 30000,
        }),
        this.page.waitForSelector('.server-body, .servers, [class*="server"]', {
          timeout: 30000,
        }),
      ]).catch(() => {
        console.log("Navigation completed or servers page loaded");
      });

      const currentUrl = this.page.url();
      console.log("Current URL after login:", currentUrl);

      if (currentUrl.includes("/go/")) {
        throw new Error(
          "Login failed - still on login page. Check your credentials."
        );
      }

      console.log("✅ Login successful!");
      return true;
    } catch (error) {
      console.error("Login error:", error.message);

      if (this.page) {
        try {
          await this.page.screenshot({ path: "login-error.png" });
          console.log("Screenshot saved to login-error.png");
        } catch (e) {}
      }

      throw new Error(`Login failed: ${error.message}`);
    }
  }

  async startServer() {
    try {
      const currentUrl = this.page.url();
      if (!currentUrl.includes("/server")) {
        console.log("Navigating to servers page...");
        await this.page.goto("https://aternos.org/servers/", {
          waitUntil: "networkidle0",
          timeout: 30000,
        });
        await this.delay(2000);
      }

      console.log("Looking for servers...");
      await this.page.waitForSelector(
        '.server-body, .server-card, [class*="server"]',
        { timeout: 20000 }
      );

      if (this.serverName) {
        console.log(`Looking for server: ${this.serverName}`);

        const serverFound = await this.page.evaluate((name) => {
          const servers = Array.from(
            document.querySelectorAll(
              '.server-body, .server-card, [class*="server-"]'
            )
          );

          for (const server of servers) {
            const text = server.textContent || "";
            if (text.toLowerCase().includes(name.toLowerCase())) {
              server.click();
              return true;
            }
          }
          return false;
        }, this.serverName);

        if (!serverFound) {
          throw new Error(`Server "${this.serverName}" not found`);
        }
      } else {
        console.log("Selecting first server...");
        await this.page.click(".server-body, .server-card");
      }

      await this.delay(3000);

      await this.page.waitForSelector(
        '[class*="status"], .server-status, #start',
        { timeout: 15000 }
      );

      console.log("Checking server status...");

      const statusInfo = await this.page.evaluate(() => {
        const statusEl = document.querySelector(
          '[class*="status"], .server-status, [class*="Status"], .statuslabel-label'
        );

        const status = statusEl
          ? statusEl.textContent.trim().toLowerCase()
          : "unknown";

        const buttons = Array.from(document.querySelectorAll("button"));
        const startBtn = buttons.find((b) => {
          const text = b.textContent.toLowerCase();
          return text.includes("start") && !text.includes("restart");
        });

        return {
          status: status,
          hasStartButton: !!startBtn,
        };
      });

      console.log("Server status:", statusInfo.status);

      if (statusInfo.status.includes("online")) {
        return {
          success: true,
          message: "Server is already online!",
          status: "online",
        };
      }

      if (
        statusInfo.status.includes("starting") ||
        statusInfo.status.includes("loading") ||
        statusInfo.status.includes("preparing")
      ) {
        return {
          success: true,
          message: "Server is already starting up!",
          status: "starting",
        };
      }

      if (!statusInfo.hasStartButton) {
        throw new Error(
          "Start button not found. Server might be in queue or restricted."
        );
      }

      console.log("Starting server...");

      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"));
        const startBtn = buttons.find((b) => {
          const text = b.textContent.toLowerCase();
          return text.includes("start") && !text.includes("restart");
        });

        if (startBtn) {
          startBtn.click();
          return true;
        }

        const startById = document.querySelector('#start, [id*="start"]');
        if (startById) {
          startById.click();
          return true;
        }

        throw new Error("Could not find start button");
      });

      await this.delay(3000);

      try {
        await this.delay(1000);
        const confirmed = await this.page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"));
          const confirmBtn = buttons.find((b) => {
            const text = b.textContent.toLowerCase();
            return (
              text.includes("confirm") ||
              text.includes("yes") ||
              text.includes("ok")
            );
          });
          if (confirmBtn) {
            confirmBtn.click();
            return true;
          }
          return false;
        });

        if (confirmed) {
          console.log("Confirmed server start");
          await this.delay(2000);
        }
      } catch (e) {}

      await this.page
        .waitForFunction(
          () => {
            const statusEl = document.querySelector(
              '[class*="status"], .server-status'
            );
            const statusText = statusEl
              ? statusEl.textContent.toLowerCase()
              : "";
            return (
              statusText.includes("starting") ||
              statusText.includes("loading") ||
              statusText.includes("online") ||
              statusText.includes("preparing")
            );
          },
          { timeout: 20000 }
        )
        .catch(() => {
          console.log("Status did not update immediately");
        });

      const newStatus = await this.page.evaluate(() => {
        const statusEl = document.querySelector(
          '[class*="status"], .server-status, .statuslabel-label'
        );
        return statusEl
          ? statusEl.textContent.trim().toLowerCase()
          : "starting";
      });

      console.log("New status:", newStatus);

      return {
        success: true,
        message:
          "Server start command sent successfully! Server is booting up...",
        status: newStatus,
      };
    } catch (error) {
      console.error("Failed to start server:", error.message);

      try {
        await this.page.screenshot({ path: "start-error.png" });
        console.log("Screenshot saved to start-error.png");
      } catch (e) {}

      throw new Error(`Failed to start server: ${error.message}`);
    }
  }

  async getServerStatus() {
    try {
      console.log("Getting server status...");

      const currentUrl = this.page.url();
      if (!currentUrl.includes("/server")) {
        await this.page.goto("https://aternos.org/servers/", {
          waitUntil: "networkidle0",
        });
        await this.delay(2000);
        await this.page.click(".server-body, .server-card");
        await this.delay(3000);
      }

      const info = await this.page.evaluate(() => {
        const statusEl = document.querySelector(
          '[class*="status"], .server-status, .statuslabel-label'
        );
        const status = statusEl ? statusEl.textContent.trim() : "Unknown";

        const playersEl = document.querySelector(
          '[class*="player"], .server-status-players, .players'
        );
        const players = playersEl ? playersEl.textContent.trim() : "Unknown";

        const addressEl = document.querySelector(
          '[class*="address"], .server-ip, .server-address'
        );
        const address = addressEl ? addressEl.textContent.trim() : "";

        return { status, players, address };
      });

      console.log("Status info:", info);

      return {
        success: true,
        status: info.status,
        players: info.players,
        address: info.address,
      };
    } catch (error) {
      console.error("Failed to get status:", error.message);
      throw new Error(`Failed to get server status: ${error.message}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log("Browser closed");
    }
  }
}

export default AternosController;
