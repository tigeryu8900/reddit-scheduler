import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
compileFromFile(path.resolve(__dirname, "data.schema.json"))
    .then(ts => fs.writeFileSync(path.resolve(__dirname, "data.d.ts"), ts));
