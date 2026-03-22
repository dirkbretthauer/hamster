package de.hamster.web.engine;

/**
 * Immutable data holder representing one hamster on the terrain.
 * Direction encoding mirrors the original simulator: 0=North, 1=East, 2=South, 3=West.
 * <p>
 * This class is intentionally free of Swing and Workbench references so that
 * TeaVM can compile it directly to JavaScript without any platform stubs.
 */
public class HamsterActor {

    // ── directions ──────────────────────────────────────────────────────────
    public static final int NORTH = 0;
    public static final int EAST  = 1;
    public static final int SOUTH = 2;
    public static final int WEST  = 3;

    // ── movement deltas indexed by direction (N, E, S, W) ───────────────────
    static final int[] DX = {  0, 1, 0, -1 };
    static final int[] DY = { -1, 0, 1,  0 };

    // ── fields ──────────────────────────────────────────────────────────────
    final int id;       // -1 = default hamster
    int x;              // column
    int y;              // row
    int dir;
    int mouth;          // grains in mouth
    int color;          // palette index (0 = default yellow)

    // ── constructors ────────────────────────────────────────────────────────

    public HamsterActor(int id, int x, int y, int dir, int mouth, int color) {
        this.id    = id;
        this.x     = x;
        this.y     = y;
        this.dir   = dir;
        this.mouth = mouth;
        this.color = color;
    }

    /** Copy constructor used for terrain snapshots. */
    public HamsterActor(HamsterActor src) {
        this(src.id, src.x, src.y, src.dir, src.mouth, src.color);
    }

    // ── accessors ────────────────────────────────────────────────────────────

    public int getId()    { return id; }
    public int getX()     { return x; }
    public int getY()     { return y; }
    public int getDir()   { return dir; }
    public int getMouth() { return mouth; }
    public int getColor() { return color; }

    void setXY(int x, int y)   { this.x = x; this.y = y; }
    void setDir(int dir)       { this.dir = dir; }
    void setMouth(int mouth)   { this.mouth = mouth; }

    /** Returns a compact JSON object string – used by the JS bridge. */
    public String toJson() {
        return "{\"id\":" + id
             + ",\"x\":"  + x
             + ",\"y\":"  + y
             + ",\"dir\":" + dir
             + ",\"mouth\":" + mouth
             + ",\"color\":" + color
             + "}";
    }
}
