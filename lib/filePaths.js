const fs = require('fs');
const nodePath = require('path');
const sep = nodePath.sep;

/**
 * Drop-in for filepaths' getSync that skips ignored directories.
 *
 * @param   {string|string[]} paths
 * @param   {object}          [opts] With optional ignore and ext arrays
 * @returns {string[]}
 */
exports.getSync = function (paths, opts = {}) {
  paths = [].concat(paths || []);
  const ignorePatterns = [].concat(opts.ignore || []).map(p => new RegExp(p));
  const extensions = [].concat(opts.ext || []);
  const results = [];

  // Patterns using $, \b or lookarounds can't prune whole directories
  const prunePatterns = ignorePatterns.filter(re => !/\$|\\[bB]|\(\?/.test(re.source));

  const formatDir = (dirPath) => {
    if (dirPath.slice(-1) !== sep) {
      dirPath += sep;
    }
    if (dirPath.indexOf(sep) !== 0 && dirPath.indexOf('.') !== 0) {
      dirPath = './' + dirPath;
    }
    return dirPath;
  };

  const walk = (dir) => {
    if (!fs.statSync(dir).isDirectory()) {
      throw new Error(dir + ' is not a directory');
    }

    const dirs = [];
    const dirPath = formatDir(dir);

    fs.readdirSync(dir, {withFileTypes: true}).forEach((entry) => {
      let type = entry;
      // Some filesystems don't report the type
      if (!entry.isFile() && !entry.isDirectory() && !entry.isSymbolicLink() &&
        !entry.isFIFO() && !entry.isSocket() && !entry.isBlockDevice() &&
        !entry.isCharacterDevice()) {
        type = fs.lstatSync(nodePath.join(dir, entry.name));
      }

      // Don't follow symbolic links
      if (type.isSymbolicLink()) return;

      if (type.isDirectory()) {
        dirs.push(entry.name);
        return;
      }

      if (extensions.length && extensions.indexOf(nodePath.extname(entry.name)) === -1) {
        return;
      }

      const filePath = dirPath + entry.name;
      if (!ignorePatterns.some(re => re.test(filePath))) {
        results.push(filePath);
      }
    });

    dirs.forEach((name) => {
      const subdir = nodePath.join(dir, name);
      if (prunePatterns.some(re => re.test(formatDir(subdir)))) return;
      walk(subdir);
    });
  };

  paths.forEach((path) => {
    if (!fs.existsSync(path)) {
      throw new Error('No such file or directory: ' + path);
    } else if (fs.statSync(path).isFile()) {
      results.push(path);
    } else {
      walk(path);
    }
  });

  return results;
};
