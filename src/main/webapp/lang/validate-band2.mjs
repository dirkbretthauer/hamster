import fs from 'node:fs';
import path from 'node:path';
import { parseProgram } from './hamster-parser.js';

const root = 'd:/Projects/hamstersimulator-v29-06-eclipse/hamstersimulator-v29-06-eclipse/hamstersimulator-2.9.6/Programme/beispielprogramme/band 2';

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, out);
        } else if (entry.isFile() && fullPath.toLowerCase().endsWith('.ham')) {
            out.push(fullPath);
        }
    }
    return out;
}

const files = walk(root);
let ok = 0;
let fail = 0;
const errors = new Map();
const failed = [];

for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    try {
        parseProgram(source, { compatibility: true, requireMain: false });
        ok += 1;
    } catch (error) {
        fail += 1;
        const message = String(error?.message ?? error).split('\n')[0];
        errors.set(message, (errors.get(message) ?? 0) + 1);
        if (failed.length < 50) {
            failed.push({ filePath, message });
        }
    }
}

const top = [...errors.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([message, count]) => ({ message, count }));

console.log(JSON.stringify({ total: files.length, ok, fail, top, failed }, null, 2));
