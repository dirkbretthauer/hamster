package de.hamster.web.exceptions;

/** Thrown when the hamster tries to move into a wall. */
public class WallInFrontException extends HamsterBaseException {
    private final int row;
    private final int col;

    public WallInFrontException(int row, int col) {
        super("Wall at row=" + row + ", col=" + col);
        this.row = row;
        this.col = col;
    }

    public int getRow() { return row; }
    public int getCol() { return col; }
}
