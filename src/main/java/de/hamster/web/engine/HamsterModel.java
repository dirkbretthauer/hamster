package de.hamster.web.engine;

import java.util.ArrayList;
import java.util.List;

import de.hamster.web.exceptions.HamsterBaseException;
import de.hamster.web.exceptions.InitException;
import de.hamster.web.exceptions.MouthEmptyException;
import de.hamster.web.exceptions.TileEmptyException;
import de.hamster.web.exceptions.WallInFrontException;

/**
 * Core simulation model – a clean re-implementation of
 * {@code de.hamster.simulation.model.SimulationModel} that is
 * completely free of Swing and Workbench references.
 *
 * <p>This class is the heart of the TeaVM prototype: every method here
 * compiles directly to JavaScript.  The JS-facing façade
 * ({@link de.hamster.web.api.EngineExports}) wraps this class and
 * exposes it to the browser.
 *
 * <p>Thread safety: the browser runs on a single thread, so the
 * synchronisation present in the desktop model is omitted here.
 */
public class HamsterModel {

    // ── simulation states ────────────────────────────────────────────────────
    public static final int NOT_RUNNING = 0;
    public static final int RUNNING     = 1;
    public static final int FINISHED    = 2;

    // ── state ────────────────────────────────────────────────────────────────
    private HamsterTerrain terrain;
    private HamsterTerrain savedTerrain;
    private List<HamsterActor> extraHamsters = new ArrayList<>();
    private List<String> log = new ArrayList<>();
    private WebTerminal terminal;
    private int state = NOT_RUNNING;
    private int nextId = 0;

    // ── construction ─────────────────────────────────────────────────────────

    public HamsterModel(int width, int height) {
        this.terrain  = new HamsterTerrain(width, height);
        this.terminal = new WebTerminal();
    }

    // ── terrain management ───────────────────────────────────────────────────

    public HamsterTerrain getTerrain() { return terrain; }

    /** Replace the terrain and clear all extra hamsters (mirrors setTerrain). */
    public void setTerrain(HamsterTerrain t) {
        this.terrain = t;
        this.extraHamsters.clear();
    }

    /**
     * Snapshot terrain + hamsters so {@link #reset()} can restore them.
     * Must be called before executing a student program.
     */
    public void start() {
        savedTerrain = new HamsterTerrain(terrain);
        extraHamsters.clear();
        log.clear();
        state = RUNNING;
        nextId = 0;
    }

    /** Restore the last snapshot taken by {@link #start()}. */
    public void reset() {
        if (savedTerrain == null) return;
        terrain = new HamsterTerrain(savedTerrain);
        extraHamsters.clear();
        log.clear();
        state = NOT_RUNNING;
        nextId = 0;
    }

    public void finish() {
        state = FINISHED;
    }

    public int getState() { return state; }

    // ── hamster creation ──────────────────────────────────────────────────────

    /**
     * Spawns a new named hamster and returns its id.
     * Mirrors the {@code CreateInstruction} path in the original.
     *
     * @param row   row index (y)
     * @param col   column index (x)
     * @param dir   direction 0=N 1=E 2=S 3=W
     * @param mouth initial grain count in mouth
     * @param color palette index
     * @return the new hamster's id
     * @throws InitException if the tile is blocked or parameters are invalid
     */
    public int createHamster(int row, int col, int dir, int mouth, int color) {
        if (terrain.getWall(col, row) || dir < 0 || dir > 3 || mouth < 0) {
            throw new InitException();
        }
        int id = nextId++;
        extraHamsters.add(new HamsterActor(id, col, row, dir, mouth, color));
        notify("create(" + row + "," + col + "," + dir + "," + mouth + ")");
        return id;
    }

    // ── movement commands ─────────────────────────────────────────────────────

    /**
     * Moves the hamster one step in the direction it is facing.
     * German API name: {@code vor}.
     */
    public void vor(int id) {
        HamsterActor h = requireHamster(id);
        int nx = h.getX() + HamsterActor.DX[h.getDir()];
        int ny = h.getY() + HamsterActor.DY[h.getDir()];
        if (terrain.getWall(nx, ny)) {
            logError(id, "vor", new WallInFrontException(ny, nx));
            throw new WallInFrontException(ny, nx);
        }
        h.setXY(nx, ny);
        notify(id, "vor()");
    }

    /**
     * Turns the hamster 90° to the left.
     * German API name: {@code linksUm}.
     */
    public void linksUm(int id) {
        HamsterActor h = requireHamster(id);
        h.setDir((h.getDir() + 3) % 4);
        notify(id, "linksUm()");
    }

    /**
     * Picks up one grain from the current tile.
     * German API name: {@code nimm}.
     */
    public void nimm(int id) {
        HamsterActor h = requireHamster(id);
        int count = terrain.getCorn(h.getX(), h.getY());
        if (count == 0) {
            TileEmptyException ex = new TileEmptyException(h.getY(), h.getX());
            logError(id, "nimm", ex);
            throw ex;
        }
        terrain.setCorn(h.getX(), h.getY(), count - 1);
        h.setMouth(h.getMouth() + 1);
        notify(id, "nimm()");
    }

    /**
     * Lays down one grain on the current tile.
     * German API name: {@code gib}.
     */
    public void gib(int id) {
        HamsterActor h = requireHamster(id);
        if (h.getMouth() == 0) {
            MouthEmptyException ex = new MouthEmptyException();
            logError(id, "gib", ex);
            throw ex;
        }
        terrain.setCorn(h.getX(), h.getY(), terrain.getCorn(h.getX(), h.getY()) + 1);
        h.setMouth(h.getMouth() - 1);
        notify(id, "gib()");
    }

    // ── predicates ────────────────────────────────────────────────────────────

    /** Returns true if the tile in front of the hamster is free (no wall). */
    public boolean vornFrei(int id) {
        HamsterActor h = requireHamster(id);
        boolean free = !terrain.getWall(
                h.getX() + HamsterActor.DX[h.getDir()],
                h.getY() + HamsterActor.DY[h.getDir()]);
        notify(id, "vornFrei() = " + free);
        return free;
    }

    /** Returns true if there is at least one grain on the current tile. */
    public boolean kornDa(int id) {
        HamsterActor h = requireHamster(id);
        boolean result = terrain.getCorn(h.getX(), h.getY()) > 0;
        notify(id, "kornDa() = " + result);
        return result;
    }

    /** Returns true if the hamster is not carrying any grains. */
    public boolean maulLeer(int id) {
        HamsterActor h = requireHamster(id);
        boolean result = h.getMouth() == 0;
        notify(id, "maulLeer() = " + result);
        return result;
    }

    // ── queries ───────────────────────────────────────────────────────────────

    public int getReihe(int id)          { return requireHamster(id).getY(); }
    public int getSpalte(int id)         { return requireHamster(id).getX(); }
    public int getBlickrichtung(int id)  { return requireHamster(id).getDir(); }
    public int getAnzahlKoerner(int id)  { return requireHamster(id).getMouth(); }

    // ── terminal I/O ──────────────────────────────────────────────────────────

    public WebTerminal getTerminal() { return terminal; }

    // ── JSON state snapshot ───────────────────────────────────────────────────

    /**
     * Serialises the full simulation state to a single JSON string.
     * The browser canvas renderer reads this after every step command.
     */
    public String toJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"state\":").append(state)
          .append(",\"terrain\":").append(terrain.toJson(extraHamsters))
          .append(",\"log\":[");
        for (int i = 0; i < log.size(); i++) {
            sb.append('"').append(escape(log.get(i))).append('"');
            if (i < log.size() - 1) sb.append(',');
        }
        sb.append("],\"terminal\":").append(terminal.toJson())
          .append('}');
        return sb.toString();
    }

    // ── internal helpers ──────────────────────────────────────────────────────

    private HamsterActor requireHamster(int id) {
        if (id == -1) return terrain.getDefaultHamster();
        for (HamsterActor h : extraHamsters) {
            if (h.getId() == id) return h;
        }
        throw new InitException();
    }

    private void notify(int id, String msg) {
        log.add("[H" + id + "] " + msg);
    }

    private void notify(String msg) {
        log.add("[sys] " + msg);
    }

    private void logError(int id, String cmd, Exception ex) {
        log.add("[H" + id + "] " + cmd + " ERROR: " + ex.getMessage());
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "");
    }
}
