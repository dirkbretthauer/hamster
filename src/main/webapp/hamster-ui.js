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

import * as E from './js/hamster-engine.js';   // TeaVM-compiled module

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
        provideInput(val) {
            state.terminal.needsInput = false;
            state.terminal.prompt = '';
            state.terminal.output.push(String(val));
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

    // terminal
    provideInput: (val) => BACKEND.api.provideInput(val),

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
const COLORS = ['#f5c518','#e74c3c','#2ecc71','#3498db','#9b59b6','#e67e22'];
const DIRS   = ['↑','→','↓','←'];   // N E S W

let canvas, ctx;

export function initCanvas(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
}

export function render(state) {
    if (!state || !ctx) return;
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
    ctx.fillText(DIRS[h.dir], px, py);

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
    const grainCells = [];

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
                grainCells.push({ row, col });
            } else if (cornCount > 0) {
                line += '*';
                grainCells.push({ row, col });
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
        ...grainCells.map(({ row, col }) => String(terrain.corn?.[row]?.[col] ?? 0)),
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

let stepQueue    = [];
let runTimerId   = null;
let onStepRender = null;

export function setStepCallback(fn) { onStepRender = fn; }

export function hasPendingProgram() {
    return runTimerId !== null || stepQueue.length > 0;
}

/**
 * Compile a program text into an array of async thunks, one per statement.
 * For the prototype, statements are split on ';'—a full parser is out of scope.
 */
export function compileProgram(text) {
    // Expose engine API as named parameters available inside student scripts.
    const API = {
        vor:               (id=-1) => engine.vor(id),
        linksUm:           (id=-1) => engine.linksUm(id),
        nimm:              (id=-1) => engine.nimm(id),
        gib:               (id=-1) => engine.gib(id),
        vornFrei:          (id=-1) => engine.vornFrei(id),
        kornDa:            (id=-1) => engine.kornDa(id),
        maulLeer:          (id=-1) => engine.maulLeer(id),
        getReihe:          (id=-1) => engine.getReihe(id),
        getSpalte:         (id=-1) => engine.getSpalte(id),
        getBlickrichtung:  (id=-1) => engine.getBlickrichtung(id),
        getAnzahlKoerner:  (id=-1) => engine.getAnzahlKoerner(id),
        createHamster:     (r,c,d,m,col=1) => engine.createHamster(r,c,d,m,col),
    };

    const paramNames  = Object.keys(API).join(',');
    const paramValues = Object.values(API);

    // Wrap the whole program as one function body so that while/for/if
    // statements work correctly across "lines".  Each call to stepProgram()
    // then executes the entire compiled function in one go and the engine's
    // built-in per-command state changes drive the animation via the step
    // callback.  For the prototype this is fine; a full debugger would need
    // to yield after each statement via async/generator semantics.
    stepQueue = [];
    try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(paramNames, text);
        stepQueue.push(() => {
            try {
                fn(...paramValues);
                return engine.getState();
            } catch(e) {
                logError('Runtime error: ' + e.message);
                return engine.getState();
            }
        });
    } catch(e) {
        logError('Compile error: ' + e.message);
    }

    return stepQueue.length;
}

/** Execute the next statement in the program queue; returns false when done. */
export function stepProgram() {
    if (stepQueue.length === 0) return false;
    const thunk = stepQueue.shift();
    const state = thunk();
    if (state && onStepRender) onStepRender(state);
    else if (onStepRender) onStepRender(engine.getState());
    return stepQueue.length > 0;
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
    stepQueue = [];
}
