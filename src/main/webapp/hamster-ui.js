/**
 * hamster-ui.js
 *
 * Browser-side integration layer for the TeaVM-compiled engine.
 *
 * Responsibilities:
 *  1. Import the TeaVM JS module and re-export a clean HamsterEngine API.
 *  2. Render the terrain on a <canvas> element.
 *  3. Manage the step-execution loop (step / run / reset buttons).
 *  4. Display the execution log and terminal output.
 *  5. Let the student type a program as a sequence of JS calls that maps
 *     to the EngineExports API – a minimal scripting harness for the prototype.
 *
 * All engine calls go through the `engine` wrapper below so errors are
 * caught and displayed in the log panel without crashing the page.
 */
// test sentinel line

import * as E from './js/hamster-engine.js';   // TeaVM-compiled module
import { ASTNodeType, parseProgram } from './lang/hamster-parser.js';
import {
    RunnerPause,
    createRunnerState as createRunnerStateCore,
    executeRunnerStep as executeRunnerStepCore,
} from './lang/hamster-runner.js';

// ╔═══════════════════════════════════════════════════════════╗
// ║  Engine wrapper                                           ║
// ╚═══════════════════════════════════════════════════════════╝

function parseState(value) {
    if (value == null) return null;
    if (typeof value === 'string') {
        try { return JSON.parse(value); }
        catch (e) { console.error('State parse error', e, value); return null; }
    }
    return value;
}

function createFallbackBackend() {
    let state = null;
    let snapshot = null;
    let nextId = 0;
    let pendingInput = null;

    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];

    const clone = obj => JSON.parse(JSON.stringify(obj));

    function makeTerrain(w, h) {
        return {
            width: w,
            height: h,
            walls: Array.from({ length: h }, () => Array.from({ length: w }, () => 0)),
            corn: Array.from({ length: h }, () => Array.from({ length: w }, () => 0)),
            hamsters: [{ id: -1, x: 0, y: 0, dir: 1, mouth: 0, color: 0 }],
        };
    }

    function initState(w, h) {
        state = {
            state: 0,
            terrain: makeTerrain(w, h),
            log: [],
            terminal: { needsInput: false, prompt: '', output: [] },
        };
        snapshot = null;
        nextId = 0;
        return clone(state);
    }

    function inside(x, y) {
        return x >= 0 && y >= 0 && y < state.terrain.height && x < state.terrain.width;
    }

    function isWall(x, y) {
        return !inside(x, y) || state.terrain.walls[y][x] === 1;
    }

    function getHamster(id) {
        const h = state.terrain.hamsters.find(x => x.id === id);
        if (!h) throw new Error('Hamster not initialised');
        return h;
    }

    function log(msg) {
        state.log.push(msg);
        if (state.log.length > 200) state.log = state.log.slice(-200);
    }

    return {
        init(w, h) {
            return initState(Math.max(1, w | 0), Math.max(1, h | 0));
        },
        loadTerrain(terString) {
            const lines = String(terString).split(/\r?\n/);
            const w = parseInt(lines[0], 10);
            const h = parseInt(lines[1], 10);
            initState(w, h);

            const cornCells = [];
            for (let row = 0; row < h; row++) {
                const line = lines[row + 2] || '';
                for (let col = 0; col < w; col++) {
                    const c = line[col] || ' ';
                    if (c === '#') state.terrain.walls[row][col] = 1;
                    if (c === '*' || c === '^' || c === '>' || c === 'v' || c === '<') {
                        cornCells.push([row, col]);
                    }
                    if (c === '^' || c === '>' || c === 'v' || c === '<') {
                        const dir = c === '^' ? 0 : c === '>' ? 1 : c === 'v' ? 2 : 3;
                        const def = getHamster(-1);
                        def.x = col;
                        def.y = row;
                        def.dir = dir;
                    }
                }
            }

            const base = 2 + h;
            for (let i = 0; i < cornCells.length; i++) {
                const [row, col] = cornCells[i];
                const val = parseInt(lines[base + i] || '0', 10);
                state.terrain.corn[row][col] = isNaN(val) ? 0 : val;
            }

            const mouthLine = base + cornCells.length;
            const mouth = parseInt(lines[mouthLine] || '0', 10);
            getHamster(-1).mouth = isNaN(mouth) ? 0 : mouth;

            return clone(state);
        },
        start() {
            snapshot = clone(state);
            state.state = 1;
            return clone(state);
        },
        reset() {
            if (snapshot) state = clone(snapshot);
            state.state = 0;
            return clone(state);
        },
        vor(id = -1) {
            const h = getHamster(id);
            const nx = h.x + DX[h.dir];
            const ny = h.y + DY[h.dir];
            if (isWall(nx, ny)) throw new Error(`Wall at row=${ny}, col=${nx}`);
            h.x = nx;
            h.y = ny;
            log(`[H${id}] vor()`);
            return clone(state);
        },
        linksUm(id = -1) {
            const h = getHamster(id);
            h.dir = (h.dir + 3) % 4;
            log(`[H${id}] linksUm()`);
            return clone(state);
        },
        nimm(id = -1) {
            const h = getHamster(id);
            const c = state.terrain.corn[h.y][h.x];
            if (c <= 0) throw new Error(`No grain at row=${h.y}, col=${h.x}`);
            state.terrain.corn[h.y][h.x] = c - 1;
            h.mouth += 1;
            log(`[H${id}] nimm()`);
            return clone(state);
        },
        gib(id = -1) {
            const h = getHamster(id);
            if (h.mouth <= 0) throw new Error('Hamster mouth is empty');
            state.terrain.corn[h.y][h.x] += 1;
            h.mouth -= 1;
            log(`[H${id}] gib()`);
            return clone(state);
        },
        vornFrei(id = -1) {
            const h = getHamster(id);
            return !isWall(h.x + DX[h.dir], h.y + DY[h.dir]);
        },
        kornDa(id = -1) {
            const h = getHamster(id);
            return state.terrain.corn[h.y][h.x] > 0;
        },
        maulLeer(id = -1) {
            return getHamster(id).mouth === 0;
        },
        getReihe(id = -1) { return getHamster(id).y; },
        getSpalte(id = -1) { return getHamster(id).x; },
        getBlickrichtung(id = -1) { return getHamster(id).dir; },
        getAnzahlKoerner(id = -1) { return getHamster(id).mouth; },
        setWall(col, row, value) {
            if (inside(col, row)) state.terrain.walls[row][col] = value ? 1 : 0;
            return clone(state);
        },
        setCorn(col, row, count) {
            if (inside(col, row)) state.terrain.corn[row][col] = Math.max(0, count | 0);
            return clone(state);
        },
        createHamster(row, col, dir, mouth, color = 1) {
            if (isWall(col, row)) throw new Error('Wall at spawn position');
            const id = nextId++;
            state.terrain.hamsters.push({ id, x: col, y: row, dir, mouth, color });
            return id;
        },
        setDefaultHamster(col, row, dir = null) {
            if (!inside(col, row)) throw new Error('Position outside terrain bounds');
            if (state.terrain.walls[row][col]) throw new Error('Cannot place hamster on a wall');
            const h = getHamster(-1);
            h.x = col;
            h.y = row;
            if (dir != null && !Number.isNaN(dir)) {
                h.dir = ((dir % 4) + 4) % 4;
            }
            return clone(state);
        },
        rotateDefaultHamster(turns = 1) {
            const h = getHamster(-1);
            const delta = turns | 0;
            h.dir = ((h.dir + delta) % 4 + 4) % 4;
            return clone(state);
        },
        provideInput(val) {
            pendingInput = String(val);
            state.terminal.needsInput = false;
            state.terminal.prompt = '';
            state.terminal.output.push(String(val));
        },
        readInt(_hamsterId = -1, prompt = '') {
            if (pendingInput != null) {
                const v = pendingInput;
                pendingInput = null;
                const n = parseInt(v, 10);
                return Number.isNaN(n) ? 0 : n;
            }
            state.terminal.needsInput = true;
            state.terminal.prompt = String(prompt || 'Enter number:');
            return 0;
        },
        readString(_hamsterId = -1, prompt = '') {
            if (pendingInput != null) {
                const v = pendingInput;
                pendingInput = null;
                return v;
            }
            state.terminal.needsInput = true;
            state.terminal.prompt = String(prompt || 'Enter text:');
            return '';
        },
        getState() {
            return clone(state);
        },
    };
}

function resolveBackend() {
    const exported = E && E.EngineExports ? E.EngineExports : E;
    const required = ['init', 'getState', 'start', 'reset', 'vor', 'linksUm', 'nimm', 'gib'];
    const hasTeaVmApi = exported && required.every(name => typeof exported[name] === 'function');
    if (hasTeaVmApi) return { mode: 'teavm', api: exported };
    console.warn('TeaVM exports not found. Using JavaScript fallback engine.');
    return { mode: 'fallback', api: createFallbackBackend() };
}

const BACKEND = resolveBackend();

function callAndParse(name, args = []) {
    const fn = BACKEND.api?.[name];
    if (typeof fn !== 'function') {
        logError(`Engine backend does not support ${name}()`);
        return BACKEND.api?.getState ? parseState(BACKEND.api.getState()) : null;
    }
    const result = fn.apply(BACKEND.api, args);
    if (BACKEND.mode === 'teavm' && typeof BACKEND.api.getState === 'function') {
        return parseState(BACKEND.api.getState());
    }
    return parseState(result);
}

export const engine = {
    // lifecycle
    init:      (w, h)   => {
        const res = BACKEND.api.init(w, h);
        if (BACKEND.mode === 'teavm') return parseState(BACKEND.api.getState());
        return parseState(res);
    },
    loadTerrain:(s)     => {
        const res = BACKEND.api.loadTerrain(s);
        if (BACKEND.mode === 'teavm') return parseState(BACKEND.api.getState());
        return parseState(res);
    },
    start:     ()       =>   parseState(BACKEND.api.start()),
    reset:     ()       =>   parseState(BACKEND.api.reset()),

    // movement  (id=-1 → default hamster)
    vor:       (id=-1)  =>  safely(() => parseState(BACKEND.api.vor(id))),
    linksUm:   (id=-1)  =>  safely(() => parseState(BACKEND.api.linksUm(id))),
    nimm:      (id=-1)  =>  safely(() => parseState(BACKEND.api.nimm(id))),
    gib:       (id=-1)  =>  safely(() => parseState(BACKEND.api.gib(id))),

    // predicates
    vornFrei:  (id=-1)  => BACKEND.api.vornFrei(id),
    kornDa:    (id=-1)  => BACKEND.api.kornDa(id),
    maulLeer:  (id=-1)  => BACKEND.api.maulLeer(id),

    // queries
    getReihe:          (id=-1) => BACKEND.api.getReihe(id),
    getSpalte:         (id=-1) => BACKEND.api.getSpalte(id),
    getBlickrichtung:  (id=-1) => BACKEND.api.getBlickrichtung(id),
    getAnzahlKoerner:  (id=-1) => BACKEND.api.getAnzahlKoerner(id),

    // terrain editing
    setWall:   (col, row, v)  => parseState(BACKEND.api.setWall(col, row, v)),
    setCorn:   (col, row, n)  => parseState(BACKEND.api.setCorn(col, row, n)),

    // hamster creation
    createHamster: (row, col, dir, mouth, color=1) =>
        BACKEND.api.createHamster(row, col, dir, mouth, color),
    setDefaultHamster: (col, row, dir=null) => callAndParse('setDefaultHamster', [col, row, dir == null ? -1 : dir]),
    rotateDefaultHamster: (turns=1) => callAndParse('rotateDefaultHamster', [turns]),

    // terminal
    provideInput: (val) => BACKEND.api.provideInput(val),
    readInt: (hamsterId=-1, prompt='') => BACKEND.api.readInt(hamsterId, prompt),
    readString: (hamsterId=-1, prompt='') => BACKEND.api.readString(hamsterId, prompt),

    // raw state
    getState: () => parseState(BACKEND.api.getState()),
};

function safely(fn) {
    try { return fn(); }
    catch(e) { logError(e.message ?? String(e)); return null; }
}

// ╔═══════════════════════════════════════════════════════════╗
// ║  Canvas renderer                                          ║
// ╚═══════════════════════════════════════════════════════════╝

const CELL   = 48;   // pixels per tile
export const CELL_SIZE = CELL;
const COLORS = ['#f5c518','#e74c3c','#2ecc71','#3498db','#9b59b6','#e67e22'];
const DIRS   = ['↑','→','↓','←'];   // N E S W
const DIR_TO_TER = ['^','>','v','<'];
const HAMSTER_SPRITE_PATHS = [
    './assets/original/hamsternorth.png',
    './assets/original/hamstereast.png',
    './assets/original/hamstersouth.png',
    './assets/original/hamsterwest.png',
];

let canvas, ctx;
let hamsterSprites = [];
let lastRenderedState = null;

function createSprite(path, onReady) {
    const img = new Image();
    if (typeof onReady === 'function') {
        img.addEventListener('load', onReady);
    }
    img.src = path;
    return img;
}

export function initCanvas(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
    hamsterSprites = HAMSTER_SPRITE_PATHS.map(path => createSprite(path, () => {
        if (lastRenderedState) {
            render(lastRenderedState);
        }
    }));
}

export function render(state) {
    if (!state || !ctx) return;
    lastRenderedState = state;
    const { terrain } = state;
    const { width, height, walls, corn, hamsters } = terrain;

    canvas.width  = width  * CELL;
    canvas.height = height * CELL;

    // background
    ctx.fillStyle = '#f9f5e7';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // grid lines
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width;  x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,height*CELL); ctx.stroke(); }
    for (let y = 0; y <= height; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(width*CELL,y*CELL); ctx.stroke(); }

    // walls & corn
    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const px = col * CELL, py = row * CELL;
            if (walls[row][col]) {
                ctx.fillStyle = '#555';
                ctx.fillRect(px+1, py+1, CELL-2, CELL-2);
            } else {
                const c = corn[row][col];
                if (c > 0) {
                    ctx.fillStyle = '#27ae60';
                    ctx.beginPath();
                    ctx.arc(px + CELL/2, py + CELL/2, CELL*0.22, 0, Math.PI*2);
                    ctx.fill();
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${CELL*0.28}px sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(c, px + CELL/2, py + CELL/2);
                }
            }
        }
    }

    // hamsters
    for (const h of hamsters) {
        drawHamster(h);
    }
}

function drawHamster(h) {
    const dir = ((h.dir % 4) + 4) % 4;
    const sprite = hamsterSprites[dir];
    if (sprite && sprite.complete && sprite.naturalWidth > 0 && sprite.naturalHeight > 0) {
        const x = h.x * CELL;
        const y = h.y * CELL;
        const padding = Math.max(2, Math.floor(CELL * 0.08));
        ctx.drawImage(sprite, x + padding, y + padding, CELL - (padding * 2), CELL - (padding * 2));

        if (h.mouth > 0) {
            const badgeX = x + CELL * 0.78;
            const badgeY = y + CELL * 0.22;
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, CELL*0.16, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${CELL*0.2}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(h.mouth, badgeX, badgeY);
        }
        return;
    }

    const px = h.x * CELL + CELL/2;
    const py = h.y * CELL + CELL/2;
    const r  = CELL * 0.36;
    const color = COLORS[h.color % COLORS.length] ?? COLORS[0];

    // body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI*2);
    ctx.fill();

    // direction arrow
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.font = `bold ${CELL*0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(DIRS[dir], px, py);

    // mouth count badge (if > 0)
    if (h.mouth > 0) {
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(px + r*0.7, py - r*0.7, CELL*0.18, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${CELL*0.22}px sans-serif`;
        ctx.fillText(h.mouth, px + r*0.7, py - r*0.7);
    }
}

// ╔═══════════════════════════════════════════════════════════╗
// ║  Log panel                                                ║
// ╚═══════════════════════════════════════════════════════════╝

let logEl;

export function initLog(el) { logEl = el; }

export function appendLog(entries) {
    if (!logEl || !entries) return;
    for (const line of entries) {
        const div = document.createElement('div');
        div.textContent = line;
        logEl.appendChild(div);
    }
    logEl.scrollTop = logEl.scrollHeight;
}

function logError(msg) {
    if (!logEl) { console.error(msg); return; }
    const div = document.createElement('div');
    div.className = 'log-error';
    div.textContent = '⚠ ' + msg;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
}

export function clearLog() {
    if (logEl) logEl.innerHTML = '';
}

/** Serialise the current terrain to classic .ter text format. */
export function terrainToTer(state) {
    const terrain = state?.terrain;
    if (!terrain) throw new Error('No terrain state to export');
    const defaultHamster = terrain.hamsters?.find(h => h.id === -1)
        || terrain.hamsters?.[0]
        || { x: 0, y: 0, dir: 1, mouth: 0 };

    const lines = [];
    const cornPositions = [];

    for (let row = 0; row < terrain.height; row++) {
        let line = '';
        for (let col = 0; col < terrain.width; col++) {
            const isWall = !!terrain.walls?.[row]?.[col];
            if (isWall) {
                line += '#';
                continue;
            }
            const isDefault = defaultHamster && defaultHamster.x === col && defaultHamster.y === row;
            const cornCount = terrain.corn?.[row]?.[col] ?? 0;
            if (isDefault) {
                const dir = ((defaultHamster.dir % 4) + 4) % 4;
                line += DIR_TO_TER[dir] || '>';
                cornPositions.push({ x: col, y: row });
            } else if (cornCount > 0) {
                line += '*';
                cornPositions.push({ x: col, y: row });
            } else {
                line += ' ';
            }
        }
        lines.push(line);
    }

    const sections = [
        String(terrain.width),
        String(terrain.height),
        ...lines,
        ...cornPositions.map(pos => String(terrain.corn?.[pos.y]?.[pos.x] ?? 0)),
        String(defaultHamster?.mouth ?? 0),
    ];

    return sections.join('\n');
}

// ╔═══════════════════════════════════════════════════════════╗
// ║  Program runner                                           ║
// ╚═══════════════════════════════════════════════════════════╝

/**
 * Executes a student's script one step at a time with a configurable
 * delay so the canvas animates each move.
 *
 * The script text is treated as a sequence of engine API calls.
 * Available symbols inside the script: vor, linksUm, nimm, gib,
 * vornFrei, kornDa, maulLeer, getReihe, getSpalte, getBlickrichtung,
 * getAnzahlKoerner, createHamster.
 *
 * Example script:
 *   vor(); vor(); linksUm(); vor(); gib();
 */

let runTimerId   = null;
let onStepRender = null;
let runnerState  = null;

const staticCompatibilityShims = new Map([
    ['Math.random', () => Math.random()],
    ['Hamster.getStandardHamster', () => ({ __kind: 'hamster', id: -1, className: 'Hamster' })],
    ['Hamster.getStandardHamsterAlsDrehHamster', () => ({ __kind: 'hamster', id: -1, className: 'Hamster' })],
]);

function invokeStaticCompatibilityShim(name, args) {
    const direct = staticCompatibilityShims.get(name);
    if (direct) {
        return direct(args ?? []);
    }
    if (name.endsWith('.getStandardHamster') || name.endsWith('.getStandardHamsterAlsDrehHamster')) {
        return { __kind: 'hamster', id: -1, className: name.split('.')[0] || 'Hamster' };
    }
    return undefined;
}

export function setStepCallback(fn) { onStepRender = fn; }

export function hasPendingProgram() {
    return runTimerId !== null || (runnerState !== null && !runnerState.finished);
}

function normalizeCompatibilitySource(text) {
    const source = String(text ?? '');
    // Some legacy examples rely on postfix ++/-- in standalone statements.
    // Normalize these forms so compatibility parsing remains robust.
    return source
        .replace(/(^|[^\w])([A-Za-z_][A-Za-z0-9_]*)\s*\+\+\s*;/gm, '$1$2 = $2 + 1;')
        .replace(/(^|[^\w])([A-Za-z_][A-Za-z0-9_]*)\s*--\s*;/gm, '$1$2 = $2 - 1;');
}

export function compileProgram(text) {
    runnerState = null;
    try {
        const normalizedSource = normalizeCompatibilitySource(text);
        const ast = parseProgram(normalizedSource, { compatibility: true, requireMain: true });
        runnerState = createRunnerStateCore(ast, {
            resolveIdentifier(name) {
                if (name === 'Hamster') {
                    return { __kind: 'class', name: 'Hamster' };
                }
                // Legacy OO examples often reference class names directly
                // (e.g. Wettlauf.durchfuehren(...)). Treat PascalCase symbols
                // as class references so static shims can handle them.
                if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) {
                    return { __kind: 'class', name };
                }
                return undefined;
            },
            createObject(className, args) {
                if (className.endsWith('Hamster')) {
                    if (args.length < 4) {
                        throw new Error(className + ' constructor expects at least 4 arguments');
                    }
                    const id = engine.createHamster(
                        Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3]),
                        args.length >= 5 ? Number(args[4]) : 1,
                    );
                    return { __kind: 'hamster', id, className };
                }
                return { __kind: 'object', className, fields: Object.create(null) };
            },
            getMember(receiver, property) {
                if (receiver && receiver.__kind === 'class' && receiver.name === 'Hamster') {
                    if (property === 'NORD') return 0;
                    if (property === 'OST') return 1;
                    if (property === 'SUED') return 2;
                    if (property === 'WEST') return 3;
                }
                if (receiver && receiver.__kind === 'object') {
                    return receiver.fields[property];
                }
                return undefined;
            },
            setMember(receiver, property, value) {
                if (receiver && receiver.__kind === 'object') {
                    receiver.fields[property] = value;
                    return true;
                }
                return false;
            },
            callMethod(receiver, methodName, args) {
                if (receiver && receiver.__kind === 'hamster') {
                    const hamsterId = receiver.id;
                    switch (methodName) {
                        case 'vor': return engine.vor(hamsterId);
                        case 'linksUm': return engine.linksUm(hamsterId);
                        case 'rechtsUm': {
                            engine.linksUm(hamsterId);
                            engine.linksUm(hamsterId);
                            return engine.linksUm(hamsterId);
                        }
                        case 'nimm': return engine.nimm(hamsterId);
                        case 'gib': return engine.gib(hamsterId);
                        case 'vornFrei': return engine.vornFrei(hamsterId);
                        case 'kornDa': return engine.kornDa(hamsterId);
                        case 'maulLeer': return engine.maulLeer(hamsterId);
                        case 'getReihe': return engine.getReihe(hamsterId);
                        case 'getSpalte': return engine.getSpalte(hamsterId);
                        case 'getBlickrichtung': return engine.getBlickrichtung(hamsterId);
                        case 'anzahlKoerner':
                        case 'getAnzahlKoerner': return engine.getAnzahlKoerner(hamsterId);
                        case 'liesZahl': {
                            const prompt = args.length > 0 ? String(args[0]) : 'Enter number:';
                            const value = engine.readInt(hamsterId, prompt);
                            if (engine.getState()?.terminal?.needsInput) {
                                throw new RunnerPause('Waiting for terminal input');
                            }
                            return value;
                        }
                        case 'liesZeichenkette':
                        case 'liesString': {
                            const prompt = args.length > 0 ? String(args[0]) : 'Enter text:';
                            const value = engine.readString(hamsterId, prompt);
                            if (engine.getState()?.terminal?.needsInput) {
                                throw new RunnerPause('Waiting for terminal input');
                            }
                            return value;
                        }
                        case 'schreib':
                            appendLog([String(args.length > 0 ? args[0] : '')]);
                            return undefined;
                        default:
                            break;
                    }
                }

                if (receiver && receiver.__kind === 'class') {
                    return this.callBuiltin(receiver.name + '.' + methodName, args);
                }

                if (typeof receiver === 'string') {
                    if (methodName === 'equals') {
                        return receiver === String(args?.[0] ?? '');
                    }
                    if (methodName === 'equalsIgnoreCase') {
                        return receiver.toLowerCase() === String(args?.[0] ?? '').toLowerCase();
                    }
                    if (methodName === 'length') {
                        return receiver.length;
                    }
                }

                throw new Error('Unsupported method call: ' + methodName);
            },
            callBuiltin(name, args, functions) {
                const shimmed = invokeStaticCompatibilityShim(name, args);
                if (shimmed !== undefined) {
                    return shimmed;
                }
                switch (name) {
                    case 'vor': return engine.vor(defaultHamsterId(args));
                    case 'linksUm': return engine.linksUm(defaultHamsterId(args));
                    case 'nimm': return engine.nimm(defaultHamsterId(args));
                    case 'gib': return engine.gib(defaultHamsterId(args));
                    case 'vornFrei': return engine.vornFrei(defaultHamsterId(args));
                    case 'kornDa': return engine.kornDa(defaultHamsterId(args));
                    case 'maulLeer': return engine.maulLeer(defaultHamsterId(args));
                    case 'getReihe': return engine.getReihe(defaultHamsterId(args));
                    case 'getSpalte': return engine.getSpalte(defaultHamsterId(args));
                    case 'getBlickrichtung': return engine.getBlickrichtung(defaultHamsterId(args));
                    case 'anzahlKoerner':
                    case 'getAnzahlKoerner': return engine.getAnzahlKoerner(defaultHamsterId(args));
                    case 'createHamster':
                        if (args.length < 4) {
                            throw new Error('createHamster expects at least 4 arguments');
                        }
                        return engine.createHamster(
                            Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3]),
                            args.length >= 5 ? Number(args[4]) : 1,
                        );
                    case 'readInt': {
                        const { hamsterId, prompt } = parseTerminalArgs(args, 'Enter number:');
                        const value = engine.readInt(hamsterId, prompt);
                        if (engine.getState()?.terminal?.needsInput) {
                            throw new RunnerPause('Waiting for terminal input');
                        }
                        return value;
                    }
                    case 'readString': {
                        const { hamsterId, prompt } = parseTerminalArgs(args, 'Enter text:');
                        const value = engine.readString(hamsterId, prompt);
                        if (engine.getState()?.terminal?.needsInput) {
                            throw new RunnerPause('Waiting for terminal input');
                        }
                        return value;
                    }
                    default:
                        throw new Error('Unknown function: ' + name);
                }
            },
        });
    } catch(e) {
        logError('Compile error: ' + e.message);
        return 0;
    }

    return runnerState && !runnerState.finished ? 1 : 0;
}

/** Execute the next statement in the program queue; returns false when done. */
export function stepProgram() {
    if (!runnerState || runnerState.finished) return false;
    try {
        const progressed = executeRunnerStepCore(runnerState);
        const state = engine.getState();
        if (onStepRender) onStepRender(state);
        if (!progressed) {
            runnerState.finished = true;
            return false;
        }
        return !runnerState.finished;
    } catch (e) {
        if (e instanceof RunnerPause) {
            if (onStepRender) onStepRender(engine.getState());
            return true;
        }
        logError('Runtime error: ' + (e.message ?? String(e)));
        runnerState.finished = true;
        if (onStepRender) onStepRender(engine.getState());
        return false;
    }
}

function parseTerminalArgs(args, defaultPrompt) {
    if (!args || args.length === 0) {
        return { hamsterId: -1, prompt: defaultPrompt };
    }
    if (args.length === 1) {
        if (typeof args[0] === 'number') {
            return { hamsterId: Number(args[0]), prompt: defaultPrompt };
        }
        return { hamsterId: -1, prompt: String(args[0]) };
    }
    return {
        hamsterId: Number(args[0]),
        prompt: String(args[1]),
    };
}

/** Run the whole program with a delay (ms) between steps. */
export function runProgram(delayMs = 400) {
    if (runTimerId !== null) return;
    function tick() {
        const hasMore = stepProgram();
        if (hasMore) {
            runTimerId = setTimeout(tick, delayMs);
        } else {
            runTimerId = null;
        }
    }
    tick();
}

/** Interrupt a running program. */
export function stopProgram() {
    if (runTimerId !== null) { clearTimeout(runTimerId); runTimerId = null; }
    runnerState = null;
}

function createRunnerState(ast) {
    const functions = new Map();
    for (const fn of ast.functions || []) {
        functions.set(fn.name, fn);
    }
    const main = functions.get('main');
    if (!main) {
        throw new Error('Program must define void main()');
    }

    return {
        ast,
        functions,
        finished: false,
        scopes: [new Map()],
        stack: [{ kind: 'stmt', node: main.body }],
    };
}

function executeRunnerStep(state) {
    while (state.stack.length > 0) {
        const frame = state.stack.pop();

        if (frame.kind === 'enterScope') {
            state.scopes.push(new Map());
            continue;
        }
        if (frame.kind === 'exitScope') {
            if (state.scopes.length > 1) {
                state.scopes.pop();
            }
            continue;
        }
        if (frame.kind !== 'stmt') {
            continue;
        }

        const node = frame.node;
        if (!node) continue;

        switch (node.type) {
            case ASTNodeType.Block:
                state.stack.push({ kind: 'exitScope' });
                for (let i = node.statements.length - 1; i >= 0; i--) {
                    state.stack.push({ kind: 'stmt', node: node.statements[i] });
                }
                state.stack.push({ kind: 'enterScope' });
                continue;

            case ASTNodeType.IfStatement: {
                const cond = truthy(evalExpression(node.test, state));
                if (cond) {
                    state.stack.push({ kind: 'stmt', node: node.consequent });
                } else if (node.alternate) {
                    state.stack.push({ kind: 'stmt', node: node.alternate });
                }
                return true;
            }

            case ASTNodeType.WhileStatement: {
                const cond = truthy(evalExpression(node.test, state));
                if (cond) {
                    state.stack.push({ kind: 'stmt', node });
                    state.stack.push({ kind: 'stmt', node: node.body });
                }
                return true;
            }

            case ASTNodeType.VariableDecl: {
                let value = defaultValueForType(node.varType);
                if (node.initializer) {
                    value = evalExpression(node.initializer, state);
                }
                declareVariable(state, node.name, value);
                return true;
            }

            case ASTNodeType.Assignment: {
                const value = evalExpression(node.value, state);
                assignVariable(state, node.name, value);
                return true;
            }

            case ASTNodeType.ExpressionStmt:
                evalExpression(node.expression, state);
                return true;

            case ASTNodeType.ReturnStatement:
                state.finished = true;
                state.stack.length = 0;
                return true;

            default:
                throw new Error('Unsupported statement type: ' + node.type);
        }
    }

    state.finished = true;
    return false;
}

function evalExpression(node, state) {
    switch (node.type) {
        case ASTNodeType.Literal:
            return node.value;

        case ASTNodeType.Identifier:
            return getVariable(state, node.name);

        case ASTNodeType.UnaryExpression: {
            const value = evalExpression(node.argument, state);
            if (node.operator === '!') return !truthy(value);
            if (node.operator === '-') return -Number(value);
            throw new Error('Unsupported unary operator: ' + node.operator);
        }

        case ASTNodeType.PostfixExpression: {
            if ((node.operator !== '--' && node.operator !== '++') || node.argument.type !== ASTNodeType.Identifier) {
                throw new Error('Only identifier++/identifier-- is supported');
            }
            const current = Number(getVariable(state, node.argument.name));
            const delta = node.operator === '++' ? 1 : -1;
            assignVariable(state, node.argument.name, current + delta);
            return current;
        }

        case ASTNodeType.BinaryExpression:
            return evalBinaryExpression(node, state);

        case ASTNodeType.CallExpression:
            return evalCallExpression(node, state);

        default:
            throw new Error('Unsupported expression type: ' + node.type);
    }
}

function evalBinaryExpression(node, state) {
    const op = node.operator;
    if (op === '&&') {
        const left = truthy(evalExpression(node.left, state));
        if (!left) return false;
        return truthy(evalExpression(node.right, state));
    }
    if (op === '||') {
        const left = truthy(evalExpression(node.left, state));
        if (left) return true;
        return truthy(evalExpression(node.right, state));
    }

    const left = evalExpression(node.left, state);
    const right = evalExpression(node.right, state);

    switch (op) {
        case '+': return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/': return Math.trunc(Number(left) / Number(right));
        case '%': return Number(left) % Number(right);
        case '==': return left === right;
        case '!=': return left !== right;
        case '<': return Number(left) < Number(right);
        case '<=': return Number(left) <= Number(right);
        case '>': return Number(left) > Number(right);
        case '>=': return Number(left) >= Number(right);
        default:
            throw new Error('Unsupported binary operator: ' + op);
    }
}

function evalCallExpression(node, state) {
    const args = node.arguments.map(arg => evalExpression(arg, state));
    const name = node.callee;

    switch (name) {
        case 'vor': return engine.vor(defaultHamsterId(args));
        case 'linksUm': return engine.linksUm(defaultHamsterId(args));
        case 'nimm': return engine.nimm(defaultHamsterId(args));
        case 'gib': return engine.gib(defaultHamsterId(args));
        case 'vornFrei': return engine.vornFrei(defaultHamsterId(args));
        case 'kornDa': return engine.kornDa(defaultHamsterId(args));
        case 'maulLeer': return engine.maulLeer(defaultHamsterId(args));
        case 'getReihe': return engine.getReihe(defaultHamsterId(args));
        case 'getSpalte': return engine.getSpalte(defaultHamsterId(args));
        case 'getBlickrichtung': return engine.getBlickrichtung(defaultHamsterId(args));
        case 'anzahlKoerner':
        case 'getAnzahlKoerner': return engine.getAnzahlKoerner(defaultHamsterId(args));
        case 'createHamster':
            if (args.length < 4) {
                throw new Error('createHamster expects at least 4 arguments');
            }
            return engine.createHamster(
                Number(args[0]), Number(args[1]), Number(args[2]), Number(args[3]),
                args.length >= 5 ? Number(args[4]) : 1,
            );
        default:
            if (state.functions.has(name)) {
                throw new Error('User-defined function calls are not supported yet: ' + name);
            }
            throw new Error('Unknown function: ' + name);
    }
}

function defaultHamsterId(args) {
    if (!args || args.length === 0) return -1;
    const first = args[0];
    if (first && typeof first === 'object' && first.__kind === 'hamster') {
        return Number(first.id);
    }
    return Number(first);
}

function truthy(value) {
    return !!value;
}

function defaultValueForType(typeName) {
    if (typeName === 'boolean') return false;
    return 0;
}

function declareVariable(state, name, value) {
    const scope = state.scopes[state.scopes.length - 1];
    if (scope.has(name)) {
        throw new Error('Variable already declared: ' + name);
    }
    scope.set(name, value);
}

function assignVariable(state, name, value) {
    for (let i = state.scopes.length - 1; i >= 0; i--) {
        const scope = state.scopes[i];
        if (scope.has(name)) {
            scope.set(name, value);
            return;
        }
    }
    throw new Error('Unknown variable: ' + name);
}

function getVariable(state, name) {
    for (let i = state.scopes.length - 1; i >= 0; i--) {
        const scope = state.scopes[i];
        if (scope.has(name)) {
            return scope.get(name);
        }
    }
    throw new Error('Unknown variable: ' + name);
}
