package de.hamster.web.api;

import org.teavm.jso.JSExport;

import de.hamster.web.engine.HamsterModel;
import de.hamster.web.engine.HamsterTerrain;
import de.hamster.web.exceptions.HamsterBaseException;

/**
 * JavaScript-facing façade for the Hamster simulation engine.
 *
 * <p>All public static methods annotated with {@code @JSExport} become
 * callable from the browser after TeaVM compiles the project:
 * <pre>
 *   import { EngineExports as H } from './js/hamster-engine.js';
 *
 *   H.init(10, 8);          // create a 10-wide × 8-tall terrain
 *   H.start();              // snapshot initial state
 *   H.vor(-1);              // move default hamster one step
 *   const json = H.getState();
 *   const state = JSON.parse(json);
 * </pre>
 *
 * <p>The ID {@code -1} always refers to the <em>default hamster</em> that
 * exists on every terrain (the one controlled in single-hamster programs).
 * Additional hamsters spawned with {@link #createHamster} receive positive
 * integer IDs starting at 0.
 *
 * <p>Every mutating method returns a JSON string describing the new simulation
 * state so the browser canvas can repaint without an extra round-trip.
 * Use {@link #getState()} to query the current state without making a move.
 *
 * <p>Error handling follows the original's contract: domain errors (wall,
 * empty tile, empty mouth) are thrown as JavaScript exceptions whose
 * {@code message} property describes the violation.
 */
public class EngineExports {

    // ── singleton model instance (one per page load) ─────────────────────────

    private static HamsterModel model;

    // ── lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Creates a new blank terrain of the given size and resets the engine.
     * Always call this (or {@link #loadTerrain}) before running any program.
     *
     * @param width  number of columns (≥ 1)
     * @param height number of rows    (≥ 1)
     */
    @JSExport
    public static void init(int width, int height) {
        model = new HamsterModel(width, height);
    }

    /**
     * Loads a terrain from a {@code .ter} format string (same format as the
     * desktop simulator).  Resets the engine around the loaded terrain.
     *
     * @param terString contents of the {@code .ter} file
     */
    @JSExport
    public static void loadTerrain(String terString) {
        if (model == null) model = new HamsterModel(1, 1);
        try {
            HamsterTerrain t = HamsterTerrain.fromString(terString);
            model.setTerrain(t);
        } catch (Exception e) {
            throw new RuntimeException("Invalid .ter data: " + e.getMessage());
        }
    }

    /**
     * Snapshots the current terrain and clears the log.
     * Must be called before executing a student program so that
     * {@link #reset()} can restore the initial state.
     */
    @JSExport
    public static String start() {
        requireModel();
        model.start();
        return model.toJson();
    }

    /**
     * Restores the terrain to the snapshot taken by {@link #start()}.
     */
    @JSExport
    public static String reset() {
        requireModel();
        model.reset();
        return model.toJson();
    }

    // ── movement commands (default hamster id = -1) ───────────────────────────

    /** Move the hamster one step forward.  German: {@code vor}. */
    @JSExport
    public static String vor(int id) {
        requireModel();
        try {
            model.vor(id);
        } catch (HamsterBaseException e) {
            throw new RuntimeException(e.getMessage());
        }
        return model.toJson();
    }

    /** Turn the hamster 90° left.  German: {@code linksUm}. */
    @JSExport
    public static String linksUm(int id) {
        requireModel();
        model.linksUm(id);
        return model.toJson();
    }

    /** Pick up one grain.  German: {@code nimm}. */
    @JSExport
    public static String nimm(int id) {
        requireModel();
        try {
            model.nimm(id);
        } catch (HamsterBaseException e) {
            throw new RuntimeException(e.getMessage());
        }
        return model.toJson();
    }

    /** Lay down one grain.  German: {@code gib}. */
    @JSExport
    public static String gib(int id) {
        requireModel();
        try {
            model.gib(id);
        } catch (HamsterBaseException e) {
            throw new RuntimeException(e.getMessage());
        }
        return model.toJson();
    }

    // ── predicates ─────────────────────────────────────────────────────────────

    /** Returns {@code true} if the tile in front of the hamster is free. */
    @JSExport
    public static boolean vornFrei(int id) {
        requireModel();
        return model.vornFrei(id);
    }

    /** Returns {@code true} if there is at least one grain on the current tile. */
    @JSExport
    public static boolean kornDa(int id) {
        requireModel();
        return model.kornDa(id);
    }

    /** Returns {@code true} if the hamster is not carrying any grains. */
    @JSExport
    public static boolean maulLeer(int id) {
        requireModel();
        return model.maulLeer(id);
    }

    // ── queries ───────────────────────────────────────────────────────────────

    @JSExport public static int getReihe(int id)         { requireModel(); return model.getReihe(id); }
    @JSExport public static int getSpalte(int id)        { requireModel(); return model.getSpalte(id); }
    @JSExport public static int getBlickrichtung(int id) { requireModel(); return model.getBlickrichtung(id); }
    @JSExport public static int getAnzahlKoerner(int id) { requireModel(); return model.getAnzahlKoerner(id); }

    // ── hamster creation ──────────────────────────────────────────────────────

    /**
     * Spawns an additional hamster and returns its id.
     *
     * @param row   row index (y), 0-based from top
     * @param col   column index (x), 0-based from left
     * @param dir   0=North 1=East 2=South 3=West
     * @param mouth initial grain count in mouth
     * @param color palette index (0 = default yellow)
     * @return assigned hamster id (pass to subsequent commands)
     */
    @JSExport
    public static int createHamster(int row, int col, int dir, int mouth, int color) {
        requireModel();
        try {
            return model.createHamster(row, col, dir, mouth, color);
        } catch (HamsterBaseException e) {
            throw new RuntimeException(e.getMessage());
        }
    }

    // ── terrain editing ───────────────────────────────────────────────────────

    /** Toggles a wall at (col, row). */
    @JSExport
    public static String setWall(int col, int row, boolean value) {
        requireModel();
        model.getTerrain().setWall(col, row, value);
        return model.toJson();
    }

    /** Sets the grain count at (col, row). */
    @JSExport
    public static String setCorn(int col, int row, int count) {
        requireModel();
        model.getTerrain().setCorn(col, row, count);
        return model.toJson();
    }

    // ── terminal I/O ─────────────────────────────────────────────────────────

    /**
     * Injects the student's typed answer when the running program is waiting
     * for input ({@code needsInput == true} in the state JSON).
     */
    @JSExport
    public static void provideInput(String value) {
        requireModel();
        model.getTerminal().provideInput(value);
    }

    // ── state snapshot ─────────────────────────────────────────────────────────

    /** Returns the full simulation state as a JSON string. */
    @JSExport
    public static String getState() {
        requireModel();
        return model.toJson();
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private static void requireModel() {
        if (model == null) {
            throw new IllegalStateException("Call init() or loadTerrain() first");
        }
    }
}
