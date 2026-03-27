# Hamster Simulator – Web Edition

Browser-based Hamster Simulator built with Java + TeaVM.
The simulation engine is compiled to JavaScript so programs can run directly in a web browser.

## References

- Java Hamster Model: <https://www.java-hamster-modell.de/index2.html>
- Original simulator: <https://www.java-hamster-modell.de/simulator.html>

## Repository layout

- `src/main/java` – Java engine and TeaVM exports
- `src/main/webapp` – browser UI and runtime scripts
- `src/test` – tests
- `docs` – GitHub Pages deployment content (static site)

## Prerequisites

- JDK 8+
- Maven 3.6+
- Modern browser with ES module support

## Build

```bash
mvn package
```

This compiles Java classes and regenerates `src/main/webapp/js/hamster-engine.js` via TeaVM.

## Run locally

```bash
mvn jetty:run
```

Open: <http://localhost:8080/hamster/>

## GitHub Pages deployment

`docs` is intended as the publish folder for GitHub Pages.

Recommended sync flow after changes:

1. Build in source project:

```bash
mvn -DskipTests package
```

2. Copy web assets from `src/main/webapp` to `docs`.

3. Commit and push.

## Notes

- Keep `docs` in sync with `src/main/webapp` before publishing.
- UI and feature history is tracked in git commits/issues instead of this README.
