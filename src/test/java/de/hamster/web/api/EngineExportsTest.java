package de.hamster.web.api;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class EngineExportsTest {

    @Test
    void defaultHamsterCanBeMovedAndRotatedViaExports() {
        EngineExports.init(6, 6);

        EngineExports.setDefaultHamster(4, 1, -1);
        assertEquals(4, EngineExports.getSpalte(-1));
        assertEquals(1, EngineExports.getReihe(-1));

        EngineExports.rotateDefaultHamster(1);
        assertEquals(2, EngineExports.getBlickrichtung(-1)); // East -> South
    }

    @Test
    void readIntRequestsInputAndConsumesProvidedValue() {
        EngineExports.init(4, 4);

        int first = EngineExports.readInt(-1, "Enter number");
        assertEquals(0, first);

        String waitingState = EngineExports.getState();
        org.junit.jupiter.api.Assertions.assertTrue(waitingState.contains("\"needsInput\":true"));

        EngineExports.provideInput("42");
        int second = EngineExports.readInt(-1, "Enter number");
        assertEquals(42, second);
    }

    @Test
    void readStringRequestsInputAndConsumesProvidedValue() {
        EngineExports.init(4, 4);

        String first = EngineExports.readString(-1, "Enter text");
        assertEquals("", first);

        String waitingState = EngineExports.getState();
        org.junit.jupiter.api.Assertions.assertTrue(waitingState.contains("\"needsInput\":true"));

        EngineExports.provideInput("hello");
        String second = EngineExports.readString(-1, "Enter text");
        assertEquals("hello", second);
    }
}
