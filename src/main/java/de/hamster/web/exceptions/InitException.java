package de.hamster.web.exceptions;

/** Thrown when a hamster is used before it has been placed on the terrain. */
public class InitException extends HamsterBaseException {
    public InitException() {
        super("Hamster not initialised");
    }
}
