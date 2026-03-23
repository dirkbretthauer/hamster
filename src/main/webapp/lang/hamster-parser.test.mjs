import assert from 'node:assert/strict';
import { parseProgram } from './hamster-parser.js';

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

test('parses valid main program with control flow', () => {
    const ast = parseProgram(`
        void main() {
            int i = 3;
            while (i > 0) {
                if (vornFrei()) {
                    vor();
                }
                i--;
            }
        }
    `);

    assert.equal(ast.type, 'Program');
    assert.equal(ast.functions.length, 1);
    assert.equal(ast.functions[0].name, 'main');
    assert.equal(ast.functions[0].body.type, 'BlockStatement');
});

test('rejects program without void main as first function', () => {
    assert.throws(
        () => parseProgram('int helper() { return 1; } void main() {}'),
        /First function must be void main\(\)/,
    );
});

test('parses additional function declarations after main', () => {
    const ast = parseProgram('void main() { } int helper(int x) { return x; }');
    assert.equal(ast.functions.length, 2);
    assert.equal(ast.functions[1].name, 'helper');
    assert.equal(ast.functions[1].parameters.length, 1);
});

test('parses do-while and member calls in compatibility mode', () => {
    const ast = parseProgram(`
        void main() {
            Hamster h = new Hamster(0, 0, Hamster.OST, 0);
            int i = 0;
            do {
                h.vor();
                i = i + 1;
            } while (i < 3);
        }
    `, { compatibility: true });

    assert.equal(ast.functions.length, 1);
    assert.equal(ast.functions[0].name, 'main');
});

test('accepts non-main class-like files in compatibility mode', () => {
    const ast = parseProgram(`
        package sample;
        class Helper {
            static int max(int a, int b) {
                if (a > b) { return a; }
                return b;
            }
        }
    `, { compatibility: true, requireMain: false });

    assert.equal(ast.type, 'Program');
    assert.equal(ast.functions.length, 0);
});
