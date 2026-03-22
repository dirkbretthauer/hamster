# Hamster Simulator – TeaVM Prototype

Proof-of-concept that compiles the Hamster Simulator's domain model to
JavaScript via [TeaVM](https://teavm.org) so students can run Hamster programs
in a plain web browser with no JVM required.

## What this proves

| Goal | Approach |
|---|---|
| Run simulation logic in the browser | TeaVM compiles `HamsterModel` (Java) → `hamster-engine.js` (JavaScript ES2015 module) |
| Zero server required for students | The compiled JS + static HTML work from any web server or CDN |
| Parity with desktop domain model | Clean re-implementation of `SimulationModel` + `Terrain` without Swing/Workbench |
| Comparison baseline | `index-cheerpj.html` runs the **original unchanged JAR** via CheerpJ |

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
        └── index-cheerpj.html            CheerpJ fallback (loads original JAR)
```

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

## Benchmark checklist (TeaVM vs CheerpJ)

Open DevTools (F12) in both pages and record:

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

## Next steps

1. **Decision**: run benchmarks to decide TeaVM-in-browser vs remote JVM service.
2. **Java compiler**: add [Eclipse JDT Core](https://projects.eclipse.org/projects/eclipse.jdt.core)  
   compiled to WASM so students can write real `.java` programs that call `H.*`.
3. **Monaco editor**: wire the editor panel to Monaco for syntax highlighting.
4. **Persistence**: add IndexedDB workspace so programs survive page reloads.
5. **Multi-hamster**: extend `hamster-ui.js` canvas renderer to show colored hamsters.
