import { contextBridge, ipcRenderer, webUtils } from "electron";
import mime from "mime-types";
import path from "path";
import os from "os";
import crypto from "crypto";
import fs from "fs/promises";
import { fetch } from "undici";
import { createWriteStream } from "fs";
import { finished } from "stream/promises";
import { Readable } from "stream";
function callMain(method, ...args) {
    return new Promise(async (resolve) => {
        const nonce = Math.random().toString(16).substring(2);
        ipcRenderer.send(method, nonce, ...args);
        ipcRenderer.once(`${method}:${nonce}`, (_event, result) => resolve(result));
    });
}
const pendingDir = path.join(os.homedir(), ".reddit", "pending");
const electronAPI = {
    async getTmpdir() {
        const tmpdir = path.join(os.tmpdir(), crypto.randomUUID());
        await fs.mkdir(tmpdir, { recursive: true });
        return tmpdir;
    },
    async addFile(tmpdir, file, name) {
        switch (file.type) {
            case "path":
                await fs.symlink(file.data.replaceAll("/", path.sep), path.join(tmpdir, name));
                break;
            case "url":
                const res = await fetch(file.data);
                const fileStream = createWriteStream(path.join(tmpdir, name));
                if (res.body) {
                    await finished(Readable.fromWeb(res.body).pipe(fileStream));
                }
                break;
            case "binary":
                await fs.writeFile(path.join(tmpdir, name), Buffer.from(file.data));
                break;
        }
    },
    async finishSaveData(tmpdir, dir, data) {
        await fs.writeFile(path.join(tmpdir, "data.json"), JSON.stringify(data, null, 2));
        await fs.rename(tmpdir, path.join(pendingDir, dir));
    },
    close() {
        return callMain("close");
    },
    mime: mime,
    webUtils: webUtils
};
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
