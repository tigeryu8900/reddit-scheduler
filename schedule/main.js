import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function listenRenderer(method, fn) {
    ipcMain.on(method, async (event, nonce, ...args) => {
        event.sender.send(`${method}:${nonce}`, await fn(...args));
    });
}
(() => {
    async function createWindow() {
        const win = new BrowserWindow({
            width: 1920,
            height: 1080,
            webPreferences: {
                preload: path.join(__dirname, "preload.mjs"),
                nodeIntegration: true
            }
        });
        await win.loadFile(path.join(__dirname, "main.html"));
    }
    app.whenReady().then(async () => {
        app.on("activate", async () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                await createWindow();
            }
        });
        await createWindow();
    });
    app.on("window-all-closed", () => app.quit());
    listenRenderer("close", () => app.quit());
})();
