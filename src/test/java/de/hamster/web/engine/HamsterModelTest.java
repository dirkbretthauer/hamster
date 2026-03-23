package de.hamster.web.engine;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import de.hamster.web.exceptions.InitException;

class HamsterModelTest {

    @Test
    void setDefaultHamsterMovesDefaultActor() {
        HamsterModel model = new HamsterModel(5, 5);

        model.setDefaultHamster(3, 2, -1);

        assertEquals(3, model.getSpalte(-1));
        assertEquals(2, model.getReihe(-1));
    }

    @Test
    void rotateDefaultHamsterSupportsPositiveAndNegativeTurns() {
        HamsterModel model = new HamsterModel(5, 5);

        model.rotateDefaultHamster(1);  // East -> South
        assertEquals(HamsterActor.SOUTH, model.getBlickrichtung(-1));

        model.rotateDefaultHamster(-2); // South -> North
        assertEquals(HamsterActor.NORTH, model.getBlickrichtung(-1));
    }

    @Test
    void setDefaultHamsterRejectsWallCells() {
        HamsterModel model = new HamsterModel(4, 4);
        model.getTerrain().setWall(1, 1, true);

        assertThrows(InitException.class, () -> model.setDefaultHamster(1, 1, -1));
    }
}
