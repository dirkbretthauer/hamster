package de.hamster.web.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * Rectangular grid that stores walls and grain counts.
 * Closely mirrors {@code de.hamster.simulation.model.Terrain} from the desktop
 * simulator but with all Swing / Workbench / Utils dependencies removed so that
 * TeaVM can compile this class to JavaScript.
 *
 * <p>Coordinate convention (same as the original):
 * <ul>
 *   <li>{@code x} = column (left → right, 0-based)</li>
 *   <li>{@code y} = row    (top  → bottom, 0-based)</li>
 * </ul>
 */
public class HamsterTerrain {

    private int width;
    private int height;
    private boolean[][] walls;  // walls[x][y]
    private int[][]     corn;   // corn[x][y]
    private HamsterActor defaultHamster;

    // ── constructors ─────────────────────────────────────────────────────────

    public HamsterTerrain(int width, int height) {
        this.width  = width;
        this.height = height;
        walls = new boolean[width][height];
        corn  = new int[width][height];
        // Default hamster starts at (0,0) facing East with 0 grains
        defaultHamster = new HamsterActor(-1, 0, 0, HamsterActor.EAST, 0, 0);
    }

    /** Deep-copy constructor used to snapshot the terrain before a run. */
    public HamsterTerrain(HamsterTerrain src) {
        this(src.width, src.height);
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                walls[x][y] = src.walls[x][y];
                corn[x][y]  = src.corn[x][y];
            }
        }
        defaultHamster = new HamsterActor(src.defaultHamster);
    }

    // ── .ter file parser ─────────────────────────────────────────────────────

    /**
     * Parses the text-based {@code .ter} format used by the desktop simulator.
     *
     * <pre>
     * Line 0      : width  (integer)
     * Line 1      : height (integer)
     * Lines 2..h+1: grid rows, one char per cell:
     *                 '#' = wall
     *                 ' ' = empty
     *                 '*' = grain cell (count follows below grid)
     *                 '^' = default hamster facing North  (also a grain cell)
     *                 '>' = default hamster facing East
     *                 'v' = default hamster facing South
     *                 '<' = default hamster facing West
     * After grid  : one integer per grain-cell (corn count)
     * Last line   : mouth count of the default hamster
     * </pre>
     */
    public static HamsterTerrain fromString(String s) {
        String[] lines = s.split("\\r?\\n");
        int w = Integer.parseInt(lines[0].trim());
        int h = Integer.parseInt(lines[1].trim());
        HamsterTerrain t = new HamsterTerrain(w, h);

        List<int[]> cornPositions = new ArrayList<>();
        int defaultDir = HamsterActor.EAST;
        int defaultX = 0, defaultY = 0;

        for (int row = 0; row < h; row++) {
            String line = lines[row + 2];
            for (int col = 0; col < w; col++) {
                char c = col < line.length() ? line.charAt(col) : ' ';
                switch (c) {
                    case '#':
                        t.walls[col][row] = true;
                        break;
                    case '*':
                        cornPositions.add(new int[]{col, row});
                        break;
                    case '^':
                        cornPositions.add(new int[]{col, row});
                        defaultX = col; defaultY = row; defaultDir = HamsterActor.NORTH;
                        break;
                    case '>':
                        cornPositions.add(new int[]{col, row});
                        defaultX = col; defaultY = row; defaultDir = HamsterActor.EAST;
                        break;
                    case 'v':
                        cornPositions.add(new int[]{col, row});
                        defaultX = col; defaultY = row; defaultDir = HamsterActor.SOUTH;
                        break;
                    case '<':
                        cornPositions.add(new int[]{col, row});
                        defaultX = col; defaultY = row; defaultDir = HamsterActor.WEST;
                        break;
                    default:
                        // ' ' – empty cell, nothing to do
                        break;
                }
            }
        }

        int afterGrid = 2 + h;
        for (int i = 0; i < cornPositions.size(); i++) {
            int[] pos = cornPositions.get(i);
            if (afterGrid + i < lines.length) {
                t.corn[pos[0]][pos[1]] = Integer.parseInt(lines[afterGrid + i].trim());
            }
        }

        int mouthLine = afterGrid + cornPositions.size();
        int mouth = mouthLine < lines.length
                ? Integer.parseInt(lines[mouthLine].trim()) : 0;

        t.defaultHamster = new HamsterActor(-1, defaultX, defaultY, defaultDir, mouth, 0);
        return t;
    }

    // ── accessors ────────────────────────────────────────────────────────────

    public int getWidth()  { return width; }
    public int getHeight() { return height; }

    private boolean inside(int x, int y) {
        return x >= 0 && y >= 0 && x < width && y < height;
    }

    public boolean getWall(int x, int y) {
        if (!inside(x, y)) return true;   // border is treated as wall
        return walls[x][y];
    }

    public void setWall(int x, int y, boolean value) {
        if (inside(x, y)) walls[x][y] = value;
    }

    public int getCorn(int x, int y) {
        if (!inside(x, y)) return 0;
        return corn[x][y];
    }

    public void setCorn(int x, int y, int count) {
        if (inside(x, y)) corn[x][y] = Math.max(0, count);
    }

    public HamsterActor getDefaultHamster() { return defaultHamster; }

    // ── JSON serialisation ───────────────────────────────────────────────────

    /**
     * Serialises the complete terrain state to a JSON string.
     * The browser harness consumes this to repaint the canvas after every step.
     */
    public String toJson(List<HamsterActor> extraHamsters) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"width\":").append(width)
          .append(",\"height\":").append(height)
          .append(",\"walls\":[");

        for (int y = 0; y < height; y++) {
            sb.append('[');
            for (int x = 0; x < width; x++) {
                sb.append(walls[x][y] ? '1' : '0');
                if (x < width - 1) sb.append(',');
            }
            sb.append(']');
            if (y < height - 1) sb.append(',');
        }

        sb.append("],\"corn\":[");
        for (int y = 0; y < height; y++) {
            sb.append('[');
            for (int x = 0; x < width; x++) {
                sb.append(corn[x][y]);
                if (x < width - 1) sb.append(',');
            }
            sb.append(']');
            if (y < height - 1) sb.append(',');
        }

        sb.append("],\"hamsters\":[");
        sb.append(defaultHamster.toJson());
        for (HamsterActor h : extraHamsters) {
            sb.append(',').append(h.toJson());
        }
        sb.append("]}");

        return sb.toString();
    }
}
