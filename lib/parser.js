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
  try {
    return attempt(
      () => _parse(src, filePath, 'script'),
      () => _parse(src, filePath, 'module')
    );
  } catch (err) {
    const ctx = getErrorContext(err, src);
    throw new Error(`Couldn't parse ${filePath}: ${err.message}${ctx}`);
  }
};

function attempt(...fns) {
  for (let i = 0; i < fns.length; i++) {
    try {
      return fns[i]();
    } catch (err) {
      if (i === fns.length - 1) throw err;
    }
  }
}

function _parse(src, filePath, sourceType) {
  const isNotTS = /^(?!.*\.ts$)/.test(filePath);

  const plugins = [
    'jsx',
    'typescript',
    'asyncDoExpressions',
    'decorators',
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

  if (isNotTS) {
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
