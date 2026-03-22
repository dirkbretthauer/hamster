import assert from 'node:assert/strict';
import { HamsterLexer, TokenType } from './hamster-lexer.js';

function lex(source) {
    const lexer = new HamsterLexer(source);
    return lexer.tokenize();
}

function withoutEof(tokens) {
    return tokens.filter(tok => tok.type !== TokenType.EOF);
}

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

test('lexes keywords, identifiers, literals, and punctuation', () => {
    const tokens = withoutEof(lex('void main() { int x = 5; return true; }'));
    const types = tokens.map(t => t.type);
    assert.deepStrictEqual(types, [
        TokenType.KEYWORD,   // void
        TokenType.IDENTIFIER,// main
        TokenType.SYMBOL,    // (
        TokenType.SYMBOL,    // )
        TokenType.SYMBOL,    // {
        TokenType.KEYWORD,   // int
        TokenType.IDENTIFIER,// x
        TokenType.OPERATOR,  // =
        TokenType.INTEGER,   // 5
        TokenType.SYMBOL,    // ;
        TokenType.KEYWORD,   // return
        TokenType.BOOLEAN,   // true
        TokenType.SYMBOL,    // ;
        TokenType.SYMBOL,    // }
    ]);
    assert.strictEqual(tokens[0].value, 'void');
    assert.strictEqual(tokens[10].value, 'return');
    assert.strictEqual(tokens[11].value, true);
});

test('handles comments and multi-character operators', () => {
    const source = `// comment\nint c = a==b && b!=c; /* block */`;
    const tokens = withoutEof(lex(source));
    const values = tokens.map(t => t.value);
    assert.deepStrictEqual(values, [
        'int', 'c', '=', 'a', '==', 'b', '&&', 'b', '!=', 'c', ';'
    ]);
});

test('throws on unterminated block comment', () => {
    assert.throws(() => lex('/* unterminated'), /Unterminated block comment/);
});
