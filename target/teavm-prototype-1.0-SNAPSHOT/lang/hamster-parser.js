import { HamsterLexer, TokenType } from './hamster-lexer.js';

export const ASTNodeType = Object.freeze({
    Program: 'Program',
    FunctionDecl: 'FunctionDeclaration',
    Parameter: 'Parameter',
    Block: 'BlockStatement',
    VariableDecl: 'VariableDeclaration',
    Assignment: 'AssignmentStatement',
    ExpressionStmt: 'ExpressionStatement',
    IfStatement: 'IfStatement',
    WhileStatement: 'WhileStatement',
    ReturnStatement: 'ReturnStatement',
    BinaryExpression: 'BinaryExpression',
    UnaryExpression: 'UnaryExpression',
    PostfixExpression: 'PostfixExpression',
    Literal: 'Literal',
    Identifier: 'Identifier',
    CallExpression: 'CallExpression',
});

export class HamsterParserError extends Error {
    constructor(message, token) {
        const location = token ? ` (line ${token.line}, column ${token.column})` : '';
        super(message + location);
        this.name = 'HamsterParserError';
        this.token = token;
    }
}

export function parseProgram(source) {
    const parser = new Parser(source);
    return parser.parseProgram();
}

class Parser {
    constructor(source) {
        this.tokens = new HamsterLexer(source).tokenize();
        this.current = 0;
    }

    parseProgram() {
        if (this.isAtEnd()) {
            throw new HamsterParserError('Program must define void main()', this.peek());
        }
        const functions = [];
        functions.push(this.parseFunction(true));
        while (!this.isAtEnd()) {
            functions.push(this.parseFunction(false));
        }
        return { type: ASTNodeType.Program, functions };
    }

    parseFunction(requireMain) {
        const returnToken = this.consumeTypeKeyword(true);
        const nameToken = this.consumeIdentifier('Expected function name');
        if (requireMain) {
            if (returnToken.value !== 'void' || nameToken.value !== 'main') {
                throw new HamsterParserError('First function must be void main()', nameToken);
            }
        }
        this.consumeSymbol('(', 'Expected ( after function name');
        const parameters = [];
        if (!this.checkSymbol(')')) {
            do {
                parameters.push(this.parseParameter());
            } while (this.matchSymbol(','));
        }
        this.consumeSymbol(')', 'Expected ) after parameter list');
        const body = this.parseBlock();
        return {
            type: ASTNodeType.FunctionDecl,
            name: nameToken.value,
            returnType: returnToken.value,
            parameters,
            body,
            loc: locationFrom(nameToken),
        };
    }

    parseParameter() {
        const typeToken = this.consumeTypeKeyword(false);
        const nameToken = this.consumeIdentifier('Expected parameter name');
        return {
            type: ASTNodeType.Parameter,
            name: nameToken.value,
            paramType: typeToken.value,
            loc: locationFrom(nameToken),
        };
    }

    parseBlock() {
        const lbrace = this.consumeSymbol('{', 'Expected { to start block');
        const statements = [];
        while (!this.checkSymbol('}') && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }
        this.consumeSymbol('}', 'Expected } to close block');
        return {
            type: ASTNodeType.Block,
            statements,
            loc: locationFrom(lbrace),
        };
    }

    parseStatement() {
        if (this.checkSymbol('{')) {
            return this.parseBlock();
        }
        if (this.checkKeyword('if')) {
            return this.parseIfStatement();
        }
        if (this.checkKeyword('while')) {
            return this.parseWhileStatement();
        }
        if (this.checkKeyword('return')) {
            return this.parseReturnStatement();
        }
        if (this.isTypeKeywordAhead()) {
            return this.parseVariableDeclaration();
        }
        if (this.isAssignmentAhead()) {
            return this.parseAssignmentStatement();
        }
        return this.parseExpressionStatement();
    }

    parseIfStatement() {
        const ifToken = this.consumeKeyword('if', 'Expected if');
        this.consumeSymbol('(', 'Expected ( after if');
        const test = this.parseExpression();
        this.consumeSymbol(')', 'Expected ) after condition');
        const consequent = this.parseStatement();
        let alternate = null;
        if (this.matchKeyword('else')) {
            alternate = this.parseStatement();
        }
        return {
            type: ASTNodeType.IfStatement,
            test,
            consequent,
            alternate,
            loc: locationFrom(ifToken),
        };
    }

    parseWhileStatement() {
        const whileToken = this.consumeKeyword('while', 'Expected while');
        this.consumeSymbol('(', 'Expected ( after while');
        const test = this.parseExpression();
        this.consumeSymbol(')', 'Expected ) after condition');
        const body = this.parseStatement();
        return {
            type: ASTNodeType.WhileStatement,
            test,
            body,
            loc: locationFrom(whileToken),
        };
    }

    parseReturnStatement() {
        const returnToken = this.consumeKeyword('return', 'Expected return');
        let argument = null;
        if (!this.checkSymbol(';')) {
            argument = this.parseExpression();
        }
        this.consumeSymbol(';', 'Expected ; after return');
        return {
            type: ASTNodeType.ReturnStatement,
            argument,
            loc: locationFrom(returnToken),
        };
    }

    parseVariableDeclaration() {
        const typeToken = this.consumeTypeKeyword(false);
        const nameToken = this.consumeIdentifier('Expected variable name');
        let initializer = null;
        if (this.matchOperator('=')) {
            initializer = this.parseExpression();
        }
        this.consumeSymbol(';', 'Expected ; after variable declaration');
        return {
            type: ASTNodeType.VariableDecl,
            varType: typeToken.value,
            name: nameToken.value,
            initializer,
            loc: locationFrom(nameToken),
        };
    }

    parseAssignmentStatement() {
        const identifier = this.advance();
        this.consumeOperator('=', 'Expected = in assignment');
        const value = this.parseExpression();
        this.consumeSymbol(';', 'Expected ; after assignment');
        return {
            type: ASTNodeType.Assignment,
            name: identifier.value,
            value,
            loc: locationFrom(identifier),
        };
    }

    parseExpressionStatement() {
        const expr = this.parseExpression();
        this.consumeSymbol(';', 'Expected ; after expression');
        return {
            type: ASTNodeType.ExpressionStmt,
            expression: expr,
            loc: expr.loc,
        };
    }

    parseExpression() {
        return this.parseLogicalOr();
    }

    parseLogicalOr() {
        let expr = this.parseLogicalAnd();
        while (this.matchOperator('||')) {
            const operator = this.previous();
            const right = this.parseLogicalAnd();
            expr = makeBinary(operator, expr, right);
        }
        return expr;
    }

    parseLogicalAnd() {
        let expr = this.parseEquality();
        while (this.matchOperator('&&')) {
            const operator = this.previous();
            const right = this.parseEquality();
            expr = makeBinary(operator, expr, right);
        }
        return expr;
    }

    parseEquality() {
        let expr = this.parseRelational();
        while (this.matchOperator('==') || this.matchOperator('!=')) {
            const operator = this.previous();
            const right = this.parseRelational();
            expr = makeBinary(operator, expr, right);
        }
        return expr;
    }

    parseRelational() {
        let expr = this.parseAdditive();
        while (this.matchOperator('<') || this.matchOperator('>') ||
               this.matchOperator('<=') || this.matchOperator('>=')) {
            const operator = this.previous();
            const right = this.parseAdditive();
            expr = makeBinary(operator, expr, right);
        }
        return expr;
    }

    parseAdditive() {
        let expr = this.parseMultiplicative();
        while (this.matchOperator('+') || this.matchOperator('-')) {
            const operator = this.previous();
            const right = this.parseMultiplicative();
            expr = makeBinary(operator, expr, right);
        }
        return expr;
    }

    parseMultiplicative() {
        let expr = this.parseUnary();
        while (this.matchOperator('*') || this.matchOperator('/') || this.matchOperator('%')) {
            const operator = this.previous();
            const right = this.parseUnary();
            expr = makeBinary(operator, expr, right);
        }
        return expr;
    }

    parseUnary() {
        if (this.matchOperator('!') || this.matchOperator('-')) {
            const operator = this.previous();
            const argument = this.parseUnary();
            return {
                type: ASTNodeType.UnaryExpression,
                operator: operator.value,
                argument,
                loc: locationFrom(operator),
            };
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let expr = this.parsePrimary();
        if (this.matchOperator('--')) {
            const operator = this.previous();
            expr = {
                type: ASTNodeType.PostfixExpression,
                operator: operator.value,
                argument: expr,
                loc: locationFrom(operator),
            };
        }
        return expr;
    }

    parsePrimary() {
        if (this.matchToken(TokenType.INTEGER)) {
            const token = this.previous();
            return {
                type: ASTNodeType.Literal,
                value: Number(token.value),
                literalType: 'int',
                loc: locationFrom(token),
            };
        }
        if (this.matchToken(TokenType.BOOLEAN)) {
            const token = this.previous();
            return {
                type: ASTNodeType.Literal,
                value: token.value,
                literalType: 'boolean',
                loc: locationFrom(token),
            };
        }
        if (this.matchToken(TokenType.IDENTIFIER)) {
            const identifier = this.previous();
            if (this.matchSymbol('(')) {
                const args = [];
                if (!this.checkSymbol(')')) {
                    do {
                        args.push(this.parseExpression());
                    } while (this.matchSymbol(','));
                }
                this.consumeSymbol(')', 'Expected ) to close argument list');
                return {
                    type: ASTNodeType.CallExpression,
                    callee: identifier.value,
                    arguments: args,
                    loc: locationFrom(identifier),
                };
            }
            return {
                type: ASTNodeType.Identifier,
                name: identifier.value,
                loc: locationFrom(identifier),
            };
        }
        if (this.matchSymbol('(')) {
            const expr = this.parseExpression();
            this.consumeSymbol(')', 'Expected ) after expression');
            return expr;
        }
        throw new HamsterParserError('Unexpected token in expression', this.peek());
    }

    isAssignmentAhead() {
        if (!this.checkToken(TokenType.IDENTIFIER)) return false;
        const next = this.peekNext();
        return next && next.type === TokenType.OPERATOR && next.value === '=';
    }

    isTypeKeywordAhead() {
        return this.checkKeyword('int') || this.checkKeyword('boolean');
    }

    consumeTypeKeyword(allowVoid) {
        if (allowVoid && this.checkKeyword('void')) {
            return this.advance();
        }
        if (this.checkKeyword('int') || this.checkKeyword('boolean')) {
            return this.advance();
        }
        throw new HamsterParserError('Expected type keyword', this.peek());
    }

    consumeIdentifier(message) {
        if (this.checkToken(TokenType.IDENTIFIER)) {
            return this.advance();
        }
        throw new HamsterParserError(message, this.peek());
    }

    consumeSymbol(symbol, message) {
        if (this.matchSymbol(symbol)) {
            return this.previous();
        }
        throw new HamsterParserError(message, this.peek());
    }

    consumeOperator(op, message) {
        if (this.matchOperator(op)) {
            return this.previous();
        }
        throw new HamsterParserError(message, this.peek());
    }

    consumeKeyword(value, message) {
        if (this.matchKeyword(value)) {
            return this.previous();
        }
        throw new HamsterParserError(message, this.peek());
    }

    matchKeyword(value) {
        if (this.checkKeyword(value)) {
            this.advance();
            return true;
        }
        return false;
    }

    matchSymbol(symbol) {
        if (this.checkSymbol(symbol)) {
            this.advance();
            return true;
        }
        return false;
    }

    matchOperator(value) {
        if (this.checkOperator(value)) {
            this.advance();
            return true;
        }
        return false;
    }

    matchToken(type) {
        if (this.checkToken(type)) {
            this.advance();
            return true;
        }
        return false;
    }

    checkKeyword(value) {
        const token = this.peek();
        return token.type === TokenType.KEYWORD && token.value === value;
    }

    checkSymbol(symbol) {
        const token = this.peek();
        return token.type === TokenType.SYMBOL && token.value === symbol;
    }

    checkOperator(value) {
        const token = this.peek();
        return token.type === TokenType.OPERATOR && token.value === value;
    }

    checkToken(type) {
        const token = this.peek();
        return token.type === type;
    }

    peek() {
        return this.tokens[this.current];
    }

    peekNext() {
        if (this.current + 1 >= this.tokens.length) {
            return this.tokens[this.tokens.length - 1];
        }
        return this.tokens[this.current + 1];
    }

    previous() {
        return this.tokens[this.current - 1];
    }

    advance() {
        if (!this.isAtEnd()) {
            this.current += 1;
        }
        return this.previous();
    }

    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }
}

function makeBinary(operatorToken, left, right) {
    return {
        type: ASTNodeType.BinaryExpression,
        operator: operatorToken.value,
        left,
        right,
        loc: locationFrom(operatorToken),
    };
}

function locationFrom(token) {
    return { line: token.line, column: token.column };
}
