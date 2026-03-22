package de.hamster.web.exceptions;

/**
 * Base for all domain errors that a Hamster program can produce.
 * Intentionally free of Swing and Workbench dependencies so TeaVM
 * can compile this class to JavaScript without platform stubs.
 */
public class HamsterBaseException extends RuntimeException {
    public HamsterBaseException(String message) {
        super(message);
    }
}
