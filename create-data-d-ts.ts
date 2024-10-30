import * as fs from "fs";
import * as path from "path";
import {fileURLToPath} from "url";
import {compileFromFile} from "json-schema-to-typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

compileFromFile(path.resolve(__dirname, "data.schema.json"))
.then(ts => fs.writeFileSync(path.resolve(__dirname, "data.d.ts"), ts));
