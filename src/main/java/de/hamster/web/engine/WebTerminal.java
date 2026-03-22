package de.hamster.web.engine;

import java.util.ArrayList;
import java.util.List;

/**
 * Web-friendly terminal that queues output lines produced by Hamster programs
 * and buffers any pending input prompt.
 *
 * <p>Because the browser has no blocking I/O, {@code readInt} and
 * {@code readString} cannot block the call synchronously.  Instead they
 * record that input is needed; the JS layer checks
 * {@link #needsInput()} and injects the answer via {@link #provideInput(String)}
 * before re-invoking the interrupted command.  This matches the pattern
 * described in {@code spec/console.md}.
 */
public class WebTerminal {

    private List<String> outputLines = new ArrayList<>();
    private boolean waitingForInput = false;
    private String pendingPrompt = "";
    private String pendingInput = null;

    // ── output ────────────────────────────────────────────────────────────────

    public void write(int hamsterId, String message) {
        outputLines.add((hamsterId == -1 ? "[sys]" : "[H" + hamsterId + "]") + " " + message);
    }

    public void writeError(Throwable t) {
        outputLines.add("[ERR] " + t.getMessage());
    }

    // ── input ─────────────────────────────────────────────────────────────────

    /**
     * Returns true when the running program is waiting for the student to
     * type something.  The JS layer should show an input field in this case.
     */
    public boolean needsInput() { return waitingForInput; }

    /** The prompt message the program displayed when requesting input. */
    public String getPendingPrompt() { return pendingPrompt; }

    /**
     * Called by the JS layer once the student has typed a value.
     * Clears the waiting flag so the next call to {@link #readString} or
     * {@link #readInt} returns the injected value.
     */
    public void provideInput(String value) {
        this.pendingInput = value;
        this.waitingForInput = false;
    }

    /**
     * Attempts to read an integer from the student.
     * Returns the injected value if one is available, otherwise
     * sets {@link #needsInput()} and returns 0 (the JS bridge must retry).
     */
    public int readInt(int hamsterId, String prompt) {
        if (pendingInput != null) {
            String v = pendingInput;
            pendingInput = null;
            try { return Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return 0; }
        }
        pendingPrompt   = prompt;
        waitingForInput = true;
        return 0;
    }

    /**
     * Attempts to read a string from the student.
     * Same retry protocol as {@link #readInt}.
     */
    public String readString(int hamsterId, String prompt) {
        if (pendingInput != null) {
            String v = pendingInput;
            pendingInput = null;
            return v;
        }
        pendingPrompt   = prompt;
        waitingForInput = true;
        return "";
    }

    // ── output access ─────────────────────────────────────────────────────────

    public List<String> getOutputLines() { return outputLines; }

    public void clear() {
        outputLines.clear();
        waitingForInput = false;
        pendingInput    = null;
        pendingPrompt   = "";
    }

    // ── JSON ──────────────────────────────────────────────────────────────────

    public String toJson() {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"needsInput\":").append(waitingForInput)
          .append(",\"prompt\":\"").append(escape(pendingPrompt)).append('"')
          .append(",\"output\":[");
        for (int i = 0; i < outputLines.size(); i++) {
            sb.append('"').append(escape(outputLines.get(i))).append('"');
            if (i < outputLines.size() - 1) sb.append(',');
        }
        sb.append("]}");
        return sb.toString();
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }
}
