# Hamster Simulator – Web Edition

Browser-based Hamster Simulator that compiles the domain model to JavaScript
via [TeaVM](https://teavm.org), so students can run Hamster programs in a
plain web browser with no JVM required.

## Original project references

- Java Hamster Model website: <https://www.java-hamster-modell.de/index2.html>
- Original simulator: <https://www.java-hamster-modell.de/simulator.html>

## What this provides

| Goal | Approach |
|---|---|
| Run simulation logic in the browser | TeaVM compiles `HamsterModel` (Java) → `hamster-engine.js` (JavaScript ES2015 module) |
| Zero server required for students | The compiled JS + static HTML work from any web server or CDN |
| Parity with desktop domain model | Clean re-implementation of `SimulationModel` + `Terrain` without Swing/Workbench |
| Alignment with original model | Browser runner stays compatible with classic hamster language samples |

## Project layout

```
teavm-prototype/
├── pom.xml                               Maven build (TeaVM plugin + Jetty)
└── src/main/
    ├── java/de/hamster/web/
    │   ├── Main.java                     TeaVM entry point
    │   ├── api/
    │   │   └── EngineExports.java        @JSExport façade → JS module exports
    │   ├── engine/
    │   │   ├── HamsterModel.java         Core simulation model (Swing-free)
    │   │   ├── HamsterTerrain.java       Terrain grid with .ter parser
    │   │   ├── HamsterActor.java         Hamster data + direction constants
    │   │   └── WebTerminal.java          Async terminal I/O for the browser
    │   └── exceptions/                   Domain exceptions (wall, empty tile, …)
    └── webapp/
        ├── index.html                    TeaVM build – interactive demo
        ├── hamster-ui.js                 Canvas renderer + program runner
                ├── lang/
                │   ├── hamster-lexer.js          Lexer for legacy .ham syntax
                │   ├── hamster-parser.js         Parser (+ compatibility mode)
                │   ├── hamster-runner.js         AST runner/interpreter
                │   ├── hamster-lexer.test.mjs    Node tests
                │   ├── hamster-parser.test.mjs   Node tests
                │   ├── hamster-runner.test.mjs   Node tests
                │   ├── validate-band2.mjs        Batch parser validation script
                │   └── package.json              Test script entrypoint
```

## Recent UX updates

- `Load Folder` button imports all `.ham` files from one selected folder.
- The same flow also imports a matching `.ter` (same base name as the entry
    program when available, otherwise the first `.ter` in the folder).
- New **Loaded Sources** panel shows the selected folder and every loaded
    source/terrain file.
- Selecting a `.ham` file in the Explorer loads that file into the program
    editor and marks it as the active run target.
- The single **Save** button writes the current program editor content back to
    the selected file when the browser provides writable file handles.

These changes are implemented in `src/main/webapp/index.html`.

## Legacy compatibility status

### What currently works

- Legacy Band 2 corpus parsing in compatibility mode (`validate-band2.mjs`)
    with full parse coverage.
- Procedural and common object-style hamster program execution in the browser:
    object construction, member calls, array indexing/assignment, terminal input,
    and common Hamster constants (`NORD`, `OST`, `SUED`, `WEST`).
- Folder-based companion file loading for multi-file samples.
- Compatibility parsing and execution for classic `for (...)` loops used by
    Band 2 samples.

### Current limits

- The runtime is not yet a full Java classloader + JVM-equivalent type system.
- Interface/inheritance-heavy helper libraries are only partially supported.
- Hardcoded shims for `Wettlauf.durchfuehren` and
    `DrehHamster.getStandardHamsterAlsDrehHamster` were removed intentionally;
    multi-file samples now rely on companion file loading and existing runtime
    compatibility hooks.

### Practical guidance for sample folders

1. Prefer **Load Folder** for classic sample directories.
2. Choose the entry `.ham` by clicking it in the **Loaded Sources** panel.
3. Ensure the folder contains the entry `.ham`, companion `.ham`, and `.ter`.
4. Use **Save** to persist changes to the currently selected `.ham` file.

## Prerequisites

| | Minimum |
|---|---|
| JDK | 8 or later (`javac` on PATH) |
| Maven | 3.6+ (`mvn` on PATH) — or use `./mvnw` if the wrapper is installed |
| Browser | Chrome/Edge recommended; Firefox works; Safari needs ES2015 module support |

## Build

```bash
# Inside teavm-prototype/
mvn package
```

TeaVM compiles all `de.hamster.web.*` sources to
`target/teavm-prototype-1.0-SNAPSHOT/js/hamster-engine.js`
and packages everything into a WAR file.

## Run locally

```bash
mvn jetty:run
```

Then open <http://localhost:8080/hamster/> in your browser.

## Benchmark checklist

Open DevTools (F12) and record:

- [ ] **Startup time** – from navigation to first interactive frame
- [ ] **JS download size** – Network tab, filter by JS, sum transferred bytes
- [ ] **Memory** – Memory tab heap snapshot after loading a .ham program
- [ ] **Animation frame rate** – Performance tab during a 200-step run
- [ ] **Browser compatibility** – repeat in Chrome, Firefox, Safari, Edge

## JavaScript API (after the TeaVM module loads)

```js
import { EngineExports as H } from './js/hamster-engine.js';

H.init(10, 8);           // blank 10×8 terrain
H.loadTerrain(str);      // load .ter file contents
H.start();               // snapshot for reset

H.vor(-1);               // default hamster: move forward
H.linksUm(-1);           // turn left
H.nimm(-1);              // pick up grain
H.gib(-1);               // lay down grain

H.vornFrei(-1);          // → boolean
H.kornDa(-1);            // → boolean
H.maulLeer(-1);          // → boolean

const id = H.createHamster(row, col, dir, mouth, color);
H.vor(id);               // control named hamster

const state = JSON.parse(H.getState());
// state.terrain.width, .height, .walls[row][col], .corn[row][col]
// state.terrain.hamsters[].{id, x, y, dir, mouth, color}
// state.log[]   – latest log entries
// state.terminal.needsInput, .prompt, .output[]
```

## Hamster language terminal I/O (Phase 3)

The in-browser hamster language runner now supports:

- `readInt()` and `readInt("Prompt")`
- `readString()` and `readString("Prompt")`
- `readInt(id, "Prompt")` and `readString(id, "Prompt")` for named hamsters

When a running program reaches one of these calls, execution pauses and the
terminal overlay requests input. After submitting input, the same statement is
retried and execution continues.

Example program:

```java
void main() {
    int steps = readInt("How many steps?");
    String msg = readString("Type any note:");

    while (steps > 0) {
        if (vornFrei()) {
            vor();
        }
        steps--;
    }
}
```

## Manual browser checklist (terminal flow)

Use this quick checklist in `index.html`:

1. Paste the sample program above and press Run.
2. Confirm the terminal overlay appears with the first prompt.
3. Enter a number and submit.
4. Confirm the second prompt appears and accepts text.
5. Confirm the hamster performs the requested number of loop iterations.
6. Confirm no duplicate step is executed before input is submitted.
7. Press Reset and rerun to verify the flow remains stable.

## Next steps

1. **Decision**: run benchmarks to decide TeaVM-in-browser vs remote JVM service.
2. **Java compiler**: add [Eclipse JDT Core](https://projects.eclipse.org/projects/eclipse.jdt.core)  
   compiled to WASM so students can write real `.java` programs that call `H.*`.
3. **Monaco editor**: wire the editor panel to Monaco for syntax highlighting.
4. **Persistence**: add IndexedDB workspace so programs survive page reloads.
5. **Multi-hamster**: extend `hamster-ui.js` canvas renderer to show colored hamsters.
