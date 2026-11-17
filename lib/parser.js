const babelParser = require('@babel/parser');
const debug = require('./debug');

/**
 * Parses the specified src string with babel/parser, returning the resulting AST
 * and skipping the undocumented File root node, which is neither babel/parser AST
 * nor ESTree spec compliant.
 *
 * @param {string} src      Source to parse
 * @param {string} filePath Path to the file
 */
exports.parse = function (src, filePath) {
  debug(`parsing ${filePath}`);
  const isTS = isTypeScript(filePath);

  const fallback = isTS
    // TS parameter decorators (Angular, NestJS)
    ? () => _parse(src, filePath, 'module', {legacyDecorators: true})
    // Flow
    : () => _parse(src, filePath, 'module', {flow: true});

  try {
    return attempt(
      () => _parse(src, filePath, 'script'),
      () => _parse(src, filePath, 'module'),
      fallback
    );
  } catch (errors) {
    const err = errors[1];
    const ctx = getErrorContext(err, src);
    throw new Error(`Couldn't parse ${filePath}: ${err.message}${ctx}`);
  }
};

function attempt(...fns) {
  const errors = [];
  for (const fn of fns) {
    try {
      return fn();
    } catch (err) {
      errors.push(err);
    }
  }
  throw errors;
}

function isTypeScript(filePath) {
  return /\.[cm]?tsx?$/.test(filePath);
}

function _parse(src, filePath, sourceType, {legacyDecorators = false, flow = false} = {}) {
  // JSX breaks <T>(x) => x generics
  const allowsJSX = !/\.[cm]?ts$/.test(filePath);

  const plugins = [
    flow ? ['flow', {all: true, enums: true}] : 'typescript',
    'asyncDoExpressions',
    legacyDecorators ? 'decorators-legacy' : 'decorators',
    'decoratorAutoAccessors',
    'deferredImportEvaluation',
    'destructuringPrivate',
    'doExpressions',
    'explicitResourceManagement',
    'exportDefaultFrom',
    'functionBind',
    'functionSent',
    'sourcePhaseImports',
    'moduleBlocks',
    ['optionalChainingAssign', { version: '2023-07' }],
    'partialApplication',
    ['pipelineOperator', { proposal: 'hack', topicToken: "^^" }],
    'throwExpressions',
  ];

  if (allowsJSX) {
    plugins.push('jsx');
  }

  return babelParser.parse(src, {
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    sourceType: sourceType,
    sourceFilename: filePath,
    plugins: plugins,
  }).program;
}

function getErrorContext(err, src) {
  if (!err.loc || !err.loc.line || err.loc.column >= 100) return '';

  const line = src.split('\n')[err.loc.line - 1];
  const caret = ' '.repeat(err.loc.column) + '^';

  return `\n${line}\n${caret}`;
}
