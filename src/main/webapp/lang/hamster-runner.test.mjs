import assert from 'node:assert/strict';
import { parseProgram } from './hamster-parser.js';
import { RunnerPause, createRunnerState, executeRunnerStep } from './hamster-runner.js';

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
}

function runAll(program, runtime) {
    const ast = parseProgram(program);
    const state = createRunnerState(ast, runtime);
    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }
    if (guard >= 1000) {
        throw new Error('Runner did not finish');
    }
}

test('runner executes while loop and builtin calls', () => {
    const calls = [];
    const runtime = {
        callBuiltin(name, args) {
            calls.push({ name, args: [...args] });
            if (name === 'vornFrei') {
                return calls.filter(c => c.name === 'vornFrei').length <= 2;
            }
            return 0;
        },
    };

    runAll(`
        void main() {
            while (vornFrei()) {
                vor();
            }
        }
    `, runtime);

    const vorCalls = calls.filter(c => c.name === 'vor').length;
    assert.equal(vorCalls, 2);
});

test('runner handles variables, assignment and postfix decrement', () => {
    const calls = [];
    const runtime = {
        callBuiltin(name, args) {
            calls.push({ name, args: [...args] });
            return 0;
        },
    };

    runAll(`
        void main() {
            int i = 2;
            while (i > 0) {
                linksUm();
                i--;
            }
        }
    `, runtime);

    assert.equal(calls.filter(c => c.name === 'linksUm').length, 2);
});

test('runner throws for unknown function call', () => {
    const ast = parseProgram('void main() { missing(); }');
    const state = createRunnerState(ast, {
        callBuiltin(name) {
            throw new Error('Unknown function: ' + name);
        },
    });

    assert.throws(() => executeRunnerStep(state), /Unknown function: missing/);
});

test('runner supports user-defined void functions', () => {
    const calls = [];
    const runtime = {
        callBuiltin(name, args) {
            calls.push({ name, args: [...args] });
            return 0;
        },
    };

    runAll(`
        void main() {
            spin();
            spin();
        }

        void spin() {
            linksUm();
        }
    `, runtime);

    assert.equal(calls.filter(c => c.name === 'linksUm').length, 2);
});

test('runner supports user-defined function return values', () => {
    const calls = [];
    const runtime = {
        callBuiltin(name, args) {
            calls.push({ name, args: [...args] });
            return 0;
        },
    };

    runAll(`
        void main() {
            int c = twice(3);
            while (c > 0) {
                vor();
                c--;
            }
        }

        int twice(int x) {
            return x + x;
        }
    `, runtime);

    assert.equal(calls.filter(c => c.name === 'vor').length, 6);
});

test('runner supports recursion with integer return values', () => {
    const calls = [];
    const runtime = {
        callBuiltin(name, args) {
            calls.push({ name, args: [...args] });
            return 0;
        },
    };

    runAll(`
        void main() {
            int c = fact(4);
            while (c > 0) {
                vor();
                c--;
            }
        }

        int fact(int n) {
            if (n <= 1) {
                return 1;
            }
            return n * fact(n - 1);
        }
    `, runtime);

    assert.equal(calls.filter(c => c.name === 'vor').length, 24);
});

test('runner validates function argument counts', () => {
    const ast = parseProgram(`
        void main() {
            int x = twice();
        }

        int twice(int n) {
            return n + n;
        }
    `);

    const state = createRunnerState(ast, {
        callBuiltin() {
            return 0;
        },
    });

    assert.throws(
        () => executeRunnerStep(state),
        /expects 1 arguments but got 0/,
    );
});

test('runner uses type default when non-void function has no return', () => {
    const calls = [];
    const runtime = {
        callBuiltin(name, args) {
            calls.push({ name, args: [...args] });
            return 0;
        },
    };

    runAll(`
        void main() {
            int c = alwaysZero();
            while (c > 0) {
                linksUm();
                c--;
            }
        }

        int alwaysZero() {
        }
    `, runtime);

    assert.equal(calls.filter(c => c.name === 'linksUm').length, 0);
});

test('runner pauses and resumes when builtin requires terminal input', () => {
    let inputReady = false;
    const calls = [];
    const ast = parseProgram(`
        void main() {
            int n = readInt();
            while (n > 0) {
                vor();
                n--;
            }
        }
    `);

    const state = createRunnerState(ast, {
        callBuiltin(name, _args) {
            if (name === 'readInt') {
                if (!inputReady) {
                    throw new RunnerPause('Waiting for input');
                }
                return 3;
            }
            calls.push(name);
            return 0;
        },
    });

    assert.throws(() => executeRunnerStep(state), RunnerPause);
    assert.equal(state.finished, false);

    inputReady = true;
    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }

    assert.equal(calls.filter(name => name === 'vor').length, 3);
});

test('runner supports readString in expression statements', () => {
    let inputReady = false;
    const ast = parseProgram(`
        void main() {
            readString();
            linksUm();
        }
    `);

    const calls = [];
    const state = createRunnerState(ast, {
        callBuiltin(name) {
            if (name === 'readString') {
                if (!inputReady) {
                    throw new RunnerPause('Waiting for text input');
                }
                return 'ok';
            }
            calls.push(name);
            return 0;
        },
    });

    assert.throws(() => executeRunnerStep(state), RunnerPause);
    inputReady = true;
    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }

    assert.equal(calls.filter(name => name === 'linksUm').length, 1);
});

test('runner supports object construction and member method calls', () => {
    const calls = [];
    const ast = parseProgram(`
        void main() {
            Hamster h = new Hamster(0, 0, Hamster.OST, 0);
            h.vor();
            h.linksUm();
        }
    `, { compatibility: true });

    const state = createRunnerState(ast, {
        resolveIdentifier(name) {
            if (name === 'Hamster') {
                return { __kind: 'class', name: 'Hamster' };
            }
            return undefined;
        },
        getMember(receiver, property) {
            if (receiver?.__kind === 'class' && receiver.name === 'Hamster' && property === 'OST') {
                return 1;
            }
            return undefined;
        },
        createObject(className, args) {
            calls.push({ kind: 'new', className, args: [...args] });
            return { __kind: 'hamster', id: 42 };
        },
        callMethod(receiver, name, args) {
            calls.push({ kind: 'method', receiverId: receiver.id, name, args: [...args] });
            return undefined;
        },
        callBuiltin() {
            throw new Error('No global builtins expected');
        },
    });

    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }

    assert.equal(calls[0].kind, 'new');
    assert.equal(calls[0].className, 'Hamster');
    assert.equal(calls[0].args[2], 1);
    assert.deepEqual(
        calls.filter(c => c.kind === 'method').map(c => c.name),
        ['vor', 'linksUm'],
    );
});

test('runner supports array creation and index assignment', () => {
    const calls = [];
    let nextId = 1;
    const ast = parseProgram(`
        void main() {
            Hamster[] hs = new Hamster[2];
            hs[0] = new Hamster(0, 0, 1, 0);
            hs[1] = new Hamster(1, 0, 1, 0);
            hs[0].vor();
            hs[1].vor();
        }
    `, { compatibility: true });

    const state = createRunnerState(ast, {
        createObject(_className, args) {
            return { __kind: 'hamster', id: nextId++, args: [...args] };
        },
        callMethod(receiver, name) {
            calls.push({ id: receiver.id, name });
            return undefined;
        },
        callBuiltin() {
            throw new Error('No global builtins expected');
        },
    });

    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }

    assert.deepEqual(calls, [
        { id: 1, name: 'vor' },
        { id: 2, name: 'vor' },
    ]);
});

test('runner supports class static method calls through runtime hooks', () => {
    const calls = [];
    const ast = parseProgram(`
        void main() {
            Hamster h = Hamster.getStandardHamster();
            h.vor();
        }
    `, { compatibility: true });

    const state = createRunnerState(ast, {
        resolveIdentifier(name) {
            if (name === 'Hamster') {
                return { __kind: 'class', name: 'Hamster' };
            }
            return undefined;
        },
        callMethod(receiver, methodName, args) {
            if (receiver?.__kind === 'class') {
                return this.callBuiltin(receiver.name + '.' + methodName, args);
            }
            calls.push(methodName);
            return undefined;
        },
        callBuiltin(name) {
            if (name === 'Hamster.getStandardHamster') {
                return { __kind: 'hamster', id: -1 };
            }
            throw new Error('Unknown function: ' + name);
        },
    });

    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }

    assert.deepEqual(calls, ['vor']);
});

test('runner can evaluate string equals via runtime callMethod hook', () => {
    const ast = parseProgram(`
        void main() {
            if (antwort.equals("Mensch")) {
                linksUm();
            }
        }
    `, { compatibility: true });

    const calls = [];
    const state = createRunnerState(ast, {
        callMethod(receiver, methodName, args) {
            if (typeof receiver === 'string' && methodName === 'equals') {
                return receiver === String(args[0]);
            }
            throw new Error('Unsupported method');
        },
        callBuiltin(name) {
            calls.push(name);
            return 0;
        },
    });
    state.scopes[0].set('antwort', 'Mensch');

    let guard = 0;
    while (!state.finished && guard++ < 1000) {
        executeRunnerStep(state);
    }

    assert.deepEqual(calls, ['linksUm']);
});
