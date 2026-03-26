import { ASTNodeType } from './hamster-parser.js';

export class RunnerPause extends Error {
    constructor(message = 'Runner paused') {
        super(message);
        this.name = 'RunnerPause';
    }
}

export function createRunnerState(ast, runtime) {
    const functions = new Map();
    for (const fn of ast.functions || []) {
        if (!functions.has(fn.name)) {
            functions.set(fn.name, []);
        }
        functions.get(fn.name).push(fn);
    }
    const mainCandidates = functions.get('main') || [];
    const main = mainCandidates.find(fn => (fn.parameters || []).length === 0) || null;
    if (!main) {
        throw new Error('Program must define void main()');
    }
    if (!runtime || typeof runtime.callBuiltin !== 'function') {
        throw new Error('Runner runtime must provide callBuiltin(name, args, functions)');
    }

    return {
        ast,
        functions,
        runtime,
        finished: false,
        scopes: [new Map()],
        stack: [{ kind: 'stmt', node: main.body }],
    };
}

export function executeRunnerStep(state) {
    while (state.stack.length > 0) {
        const frame = state.stack.pop();

        if (frame.kind === 'enterScope') {
            state.scopes.push(new Map());
            continue;
        }
        if (frame.kind === 'exitScope') {
            if (state.scopes.length > 1) {
                state.scopes.pop();
            }
            continue;
        }
        if (frame.kind !== 'stmt') {
            continue;
        }

        const node = frame.node;
        if (!node) continue;

        try {
            switch (node.type) {
                case ASTNodeType.Block:
                    state.stack.push({ kind: 'exitScope' });
                    for (let i = node.statements.length - 1; i >= 0; i--) {
                        state.stack.push({ kind: 'stmt', node: node.statements[i] });
                    }
                    state.stack.push({ kind: 'enterScope' });
                    continue;

                case ASTNodeType.IfStatement: {
                    const cond = truthy(evalExpression(node.test, state));
                    if (cond) {
                        state.stack.push({ kind: 'stmt', node: node.consequent });
                    } else if (node.alternate) {
                        state.stack.push({ kind: 'stmt', node: node.alternate });
                    }
                    return true;
                }

                case ASTNodeType.WhileStatement: {
                    const cond = truthy(evalExpression(node.test, state));
                    if (cond) {
                        state.stack.push({ kind: 'stmt', node });
                        state.stack.push({ kind: 'stmt', node: node.body });
                    }
                    return true;
                }

                case ASTNodeType.DoWhileStatement: {
                    const cond = truthy(evalExpression(node.test, state));
                    if (cond) {
                        state.stack.push({ kind: 'stmt', node });
                    }
                    state.stack.push({ kind: 'stmt', node: node.body });
                    return true;
                }

                case ASTNodeType.ForStatement:
                    throw new Error('For statements are not supported at runtime');

                case ASTNodeType.VariableDecl: {
                    let value = defaultValueForType(node.varType);
                    if (node.initializer) {
                        value = evalExpression(node.initializer, state);
                    }
                    declareVariable(state, node.name, value);
                    return true;
                }

                case ASTNodeType.Assignment: {
                    const value = evalExpression(node.value, state);
                    assignTarget(state, node.target ?? null, node.name, value);
                    return true;
                }

                case ASTNodeType.ExpressionStmt:
                    evalExpression(node.expression, state);
                    return true;

                case ASTNodeType.ReturnStatement:
                    state.finished = true;
                    state.stack.length = 0;
                    return true;

                default:
                    throw new Error('Unsupported statement type: ' + node.type);
            }
        } catch (e) {
            if (e instanceof RunnerPause) {
                // Retry the same statement after input is provided.
                state.stack.push(frame);
            }
            throw e;
        }
    }

    state.finished = true;
    return false;
}

const KNOWN_BUILTINS = new Set([
    'vor',
    'linksUm',
    'nimm',
    'gib',
    'vornFrei',
    'kornDa',
    'maulLeer',
    'getReihe',
    'getSpalte',
    'getBlickrichtung',
    'getAnzahlKoerner',
    'anzahlKoerner',
    'createHamster',
    'readInt',
    'readString',
]);

function isKnownBuiltinName(name) {
    if (KNOWN_BUILTINS.has(name)) return true;
    if (name === 'Math.random') return true;
    if (name.endsWith('.getStandardHamster') || name.endsWith('.getStandardHamsterAlsDrehHamster')) return true;
    return false;
}

function evalExpression(node, state) {
    switch (node.type) {
        case ASTNodeType.Literal:
            return node.value;

        case ASTNodeType.Identifier:
            return resolveIdentifierValue(state, node.name);

        case ASTNodeType.MemberExpression:
            return evalMemberExpression(node, state);

        case ASTNodeType.IndexExpression:
            return evalIndexExpression(node, state);

        case ASTNodeType.NewExpression:
            return evalNewExpression(node, state);

        case ASTNodeType.ThisExpression:
            return getVariable(state, 'this');

        case ASTNodeType.UnaryExpression: {
            const value = evalExpression(node.argument, state);
            if (node.operator === '!') return !truthy(value);
            if (node.operator === '-') return -Number(value);
            throw new Error('Unsupported unary operator: ' + node.operator);
        }

        case ASTNodeType.PostfixExpression: {
            if ((node.operator !== '--' && node.operator !== '++') || node.argument.type !== ASTNodeType.Identifier) {
                throw new Error('Only identifier++/identifier-- is supported');
            }
            const current = Number(getVariable(state, node.argument.name));
            const delta = node.operator === '++' ? 1 : -1;
            assignVariable(state, node.argument.name, current + delta);
            return current;
        }

        case ASTNodeType.BinaryExpression:
            return evalBinaryExpression(node, state);

        case ASTNodeType.ConditionalExpression:
            return truthy(evalExpression(node.test, state))
                ? evalExpression(node.consequent, state)
                : evalExpression(node.alternate, state);

        case ASTNodeType.CallExpression:
            return evalCallExpression(node, state, 0);

        default:
            throw new Error('Unsupported expression type: ' + node.type);
    }
}

function evalCallExpression(node, state, callDepth) {
    if (node.callee?.type === ASTNodeType.MemberExpression) {
        const receiver = evalExpression(node.callee.object, state);
        const methodName = node.callee.property;
        const args = node.arguments.map(arg => evalExpression(arg, state));

        // Compatibility mode often models static class calls (ClassName.method(...))
        // as top-level user functions declared in companion .ham files.
        if (receiver && receiver.__kind === 'class') {
            const candidates = state.functions.get(methodName) || [];
            const fn = candidates.find(candidate => (candidate.parameters || []).length === args.length);
            if (fn) {
                return invokeUserFunction(fn, args, state, callDepth + 1);
            }
        }

        if (typeof state.runtime.callMethod === 'function') {
            return state.runtime.callMethod(receiver, methodName, args, state.functions);
        }
        const fallbackName = stringifyReceiver(receiver) + '.' + methodName;
        return state.runtime.callBuiltin(fallbackName, args, state.functions);
    }

    const args = node.arguments.map(arg => evalExpression(arg, state));
    const calleeName = resolveCalleeName(node.callee);
    if (!calleeName) {
        throw new Error('Unsupported call expression callee');
    }
    const candidates = state.functions.get(calleeName) || [];
    const fn = candidates.find(candidate => (candidate.parameters || []).length === args.length);

    if (fn) {
        return invokeUserFunction(fn, args, state, callDepth + 1);
    }

    if (candidates.length > 0) {
        if (isKnownBuiltinName(calleeName)) {
            return state.runtime.callBuiltin(calleeName, args, state.functions);
        }

        const sample = candidates[0];
        const expected = (sample.parameters || []).length;
        throw new Error('Function ' + calleeName + ' expects ' + expected + ' arguments but got ' + args.length);
    }

    return state.runtime.callBuiltin(calleeName, args, state.functions);
}

function invokeUserFunction(fn, args, state, callDepth) {
    if (callDepth > 256) {
        throw new Error('Maximum function call depth exceeded');
    }
    if ((fn.parameters || []).length !== args.length) {
        throw new Error('Function ' + fn.name + ' expects ' + fn.parameters.length + ' arguments but got ' + args.length);
    }

    const functionScope = new Map();
    for (let i = 0; i < fn.parameters.length; i++) {
        functionScope.set(fn.parameters[i].name, args[i]);
    }

    state.scopes.push(functionScope);
    try {
        const result = executeStatementImmediate(fn.body, state, callDepth);
        if (fn.returnType === 'void') {
            return undefined;
        }
        if (result.returned) {
            return result.value;
        }
        return defaultValueForType(fn.returnType);
    } finally {
        state.scopes.pop();
    }
}

function executeStatementImmediate(node, state, callDepth) {
    if (!node) {
        return { returned: false, value: undefined };
    }

    switch (node.type) {
        case ASTNodeType.Block: {
            state.scopes.push(new Map());
            try {
                for (const stmt of node.statements || []) {
                    const result = executeStatementImmediate(stmt, state, callDepth);
                    if (result.returned) {
                        return result;
                    }
                }
                return { returned: false, value: undefined };
            } finally {
                state.scopes.pop();
            }
        }

        case ASTNodeType.IfStatement: {
            const cond = truthy(evalExpression(node.test, state));
            if (cond) {
                return executeStatementImmediate(node.consequent, state, callDepth);
            }
            if (node.alternate) {
                return executeStatementImmediate(node.alternate, state, callDepth);
            }
            return { returned: false, value: undefined };
        }

        case ASTNodeType.WhileStatement: {
            let guard = 0;
            while (truthy(evalExpression(node.test, state))) {
                if (++guard > 100000) {
                    throw new Error('Loop iteration limit exceeded');
                }
                const result = executeStatementImmediate(node.body, state, callDepth);
                if (result.returned) {
                    return result;
                }
            }
            return { returned: false, value: undefined };
        }

        case ASTNodeType.DoWhileStatement: {
            let guard = 0;
            do {
                if (++guard > 100000) {
                    throw new Error('Loop iteration limit exceeded');
                }
                const result = executeStatementImmediate(node.body, state, callDepth);
                if (result.returned) {
                    return result;
                }
            } while (truthy(evalExpression(node.test, state)));
            return { returned: false, value: undefined };
        }

        case ASTNodeType.ForStatement:
            throw new Error('For statements are not supported at runtime');

        case ASTNodeType.VariableDecl: {
            let value = defaultValueForType(node.varType);
            if (node.initializer) {
                value = evalExpression(node.initializer, state);
            }
            declareVariable(state, node.name, value);
            return { returned: false, value: undefined };
        }

        case ASTNodeType.Assignment: {
            const value = evalExpression(node.value, state);
            assignTarget(state, node.target ?? null, node.name, value);
            return { returned: false, value: undefined };
        }

        case ASTNodeType.ExpressionStmt:
            evalExpression(node.expression, state);
            return { returned: false, value: undefined };

        case ASTNodeType.ReturnStatement: {
            const value = node.argument ? evalExpression(node.argument, state) : undefined;
            return { returned: true, value };
        }

        default:
            throw new Error('Unsupported statement type: ' + node.type);
    }
}

function evalBinaryExpression(node, state) {
    const op = node.operator;
    if (op === '&&') {
        const left = truthy(evalExpression(node.left, state));
        if (!left) return false;
        return truthy(evalExpression(node.right, state));
    }
    if (op === '||') {
        const left = truthy(evalExpression(node.left, state));
        if (left) return true;
        return truthy(evalExpression(node.right, state));
    }

    const left = evalExpression(node.left, state);
    const right = evalExpression(node.right, state);

    switch (op) {
        case '+': return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/': return Math.trunc(Number(left) / Number(right));
        case '%': return Number(left) % Number(right);
        case '==': return left === right;
        case '!=': return left !== right;
        case '<': return Number(left) < Number(right);
        case '<=': return Number(left) <= Number(right);
        case '>': return Number(left) > Number(right);
        case '>=': return Number(left) >= Number(right);
        default:
            throw new Error('Unsupported binary operator: ' + op);
    }
}

function truthy(value) {
    return !!value;
}

function defaultValueForType(typeName) {
    if (typeName === 'boolean') return false;
    if (typeName === 'int') return 0;
    return null;
}

function declareVariable(state, name, value) {
    const scope = state.scopes[state.scopes.length - 1];
    if (scope.has(name)) {
        throw new Error('Variable already declared: ' + name);
    }
    scope.set(name, value);
}

function assignVariable(state, name, value) {
    for (let i = state.scopes.length - 1; i >= 0; i--) {
        const scope = state.scopes[i];
        if (scope.has(name)) {
            scope.set(name, value);
            return;
        }
    }
    throw new Error('Unknown variable: ' + name);
}

function getVariable(state, name) {
    for (let i = state.scopes.length - 1; i >= 0; i--) {
        const scope = state.scopes[i];
        if (scope.has(name)) {
            return scope.get(name);
        }
    }
    throw new Error('Unknown variable: ' + name);
}

function resolveIdentifierValue(state, name) {
    try {
        return getVariable(state, name);
    } catch (error) {
        if (typeof state.runtime.resolveIdentifier === 'function') {
            const resolved = state.runtime.resolveIdentifier(name, state.functions);
            if (resolved !== undefined) {
                return resolved;
            }
        }
        throw error;
    }
}

function evalMemberExpression(node, state) {
    const receiver = evalExpression(node.object, state);
    if (receiver == null) {
        throw new Error('Cannot read property ' + node.property + ' of null');
    }
    if (Array.isArray(receiver) && node.property === 'length') {
        return receiver.length;
    }
    if (typeof state.runtime.getMember === 'function') {
        const resolved = state.runtime.getMember(receiver, node.property, state.functions);
        if (resolved !== undefined) {
            return resolved;
        }
    }
    if (typeof receiver === 'object' && Object.prototype.hasOwnProperty.call(receiver, node.property)) {
        return receiver[node.property];
    }
    throw new Error('Unknown member: ' + node.property);
}

function evalIndexExpression(node, state) {
    const target = evalExpression(node.object, state);
    const index = Number(evalExpression(node.index, state));
    if (Array.isArray(target)) {
        return target[index];
    }
    if (typeof target === 'string') {
        return target.charAt(index);
    }
    throw new Error('Index access is only supported for arrays and strings');
}

function evalNewExpression(node, state) {
    if (node.dimensions && node.dimensions.length > 0) {
        const firstDim = node.dimensions[0];
        const length = firstDim == null ? 0 : Number(evalExpression(firstDim, state));
        const safeLength = Number.isFinite(length) && length > 0 ? Math.trunc(length) : 0;
        return new Array(safeLength).fill(null);
    }

    const args = (node.arguments || []).map(arg => evalExpression(arg, state));
    if (typeof state.runtime.createObject === 'function') {
        const className = resolveCalleeName(node.callee) || 'Object';
        return state.runtime.createObject(className, args, state.functions);
    }
    return {
        __className: resolveCalleeName(node.callee) || 'Object',
        __args: args,
    };
}

function assignTarget(state, targetNode, name, value) {
    if (targetNode && targetNode.type === ASTNodeType.Identifier) {
        assignVariable(state, targetNode.name, value);
        return;
    }
    if (!targetNode && name) {
        assignVariable(state, name, value);
        return;
    }
    if (targetNode && targetNode.type === ASTNodeType.MemberExpression) {
        const receiver = evalExpression(targetNode.object, state);
        if (receiver == null) {
            throw new Error('Cannot assign member on null receiver');
        }
        if (typeof state.runtime.setMember === 'function') {
            const handled = state.runtime.setMember(receiver, targetNode.property, value, state.functions);
            if (handled === true) {
                return;
            }
        }
        if (typeof receiver === 'object') {
            receiver[targetNode.property] = value;
            return;
        }
        throw new Error('Unsupported assignment target');
    }
    if (targetNode && targetNode.type === ASTNodeType.IndexExpression) {
        const receiver = evalExpression(targetNode.object, state);
        const index = Number(evalExpression(targetNode.index, state));
        if (Array.isArray(receiver)) {
            receiver[index] = value;
            return;
        }
        throw new Error('Unsupported index assignment target');
    }
    throw new Error('Unsupported assignment target');
}

function stringifyReceiver(receiver) {
    if (receiver && typeof receiver === 'object' && typeof receiver.__className === 'string') {
        return receiver.__className;
    }
    if (typeof receiver === 'string') {
        return receiver;
    }
    return 'object';
}

function resolveCalleeName(calleeNode) {
    if (!calleeNode) {
        return null;
    }
    if (typeof calleeNode === 'string') {
        return calleeNode;
    }
    if (calleeNode.type === ASTNodeType.Identifier) {
        return calleeNode.name;
    }
    if (calleeNode.type === ASTNodeType.MemberExpression) {
        const objectName = resolveCalleeName(calleeNode.object);
        if (!objectName) return null;
        return objectName + '.' + calleeNode.property;
    }
    return null;
}
