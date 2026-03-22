package de.hamster.web.exceptions;

/** Thrown when the hamster tries to lay down a grain but its mouth is empty. */
public class MouthEmptyException extends HamsterBaseException {
    public MouthEmptyException() {
        super("Hamster mouth is empty");
    }
}
