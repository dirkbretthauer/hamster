package de.hamster.web.exceptions;

/** Thrown when the hamster tries to pick up a grain from an empty tile. */
public class TileEmptyException extends HamsterBaseException {
    private final int row;
    private final int col;

    public TileEmptyException(int row, int col) {
        super("No grain at row=" + row + ", col=" + col);
        this.row = row;
        this.col = col;
    }

    public int getRow() { return row; }
    public int getCol() { return col; }
}
