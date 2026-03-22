package de.hamster.web;

/**
 * TeaVM entry point.
 *
 * TeaVM requires a class with a {@code public static void main(String[])}
 * method as the compilation root.  All exported symbols are discovered via
 * {@code @JSExport} on {@link de.hamster.web.api.EngineExports};
 * this main method is intentionally empty.
 */
public class Main {
    public static void main(String[] args) {
        // No initialisation needed: the browser calls EngineExports.init()
        // after the JS module is imported.
    }
}
