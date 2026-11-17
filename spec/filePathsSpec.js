const expect    = require('expect.js');
const fs        = require('fs');
const os        = require('os');
const path      = require('path');
const filePaths = require('../lib/filePaths');

describe('filePaths', function() {
  const files = [
    'a.js',
    'notes.txt',
    'lib/b.ts',
    'lib/c.mjs',
    'lib/test/d.js',
    'node_modules/pkg/e.js',
    'node_modules/pkg/deep/f.js',
  ];
  const opts = () => ({
    ext: ['.js', '.ts', '.mjs'],
    ignore: ['node_modules', 'test'],
  });
  const expected = (...relPaths) => relPaths.map(p => './' + path.join('proj', p)).sort();

  let tmp, cwd;

  before(function() {
    cwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jsinspect-'));
    files.forEach((file) => {
      const full = path.join(tmp, 'proj', file);
      fs.mkdirSync(path.dirname(full), {recursive: true});
      fs.writeFileSync(full, '');
    });
    process.chdir(tmp);
  });

  after(function() {
    process.chdir(cwd);
    fs.rmSync(tmp, {recursive: true, force: true});
  });

  it('returns files with matching extensions that are not ignored', function() {
    const res = filePaths.getSync(['proj'], opts()).sort();
    expect(res).to.eql(expected('a.js', 'lib/b.ts', 'lib/c.mjs'));
  });

  it('does not walk into ignored directories', function() {
    const readdirSync = fs.readdirSync;
    const read = [];
    fs.readdirSync = function(dir) {
      read.push(dir);
      return readdirSync.apply(fs, arguments);
    };

    try {
      filePaths.getSync(['proj'], opts());
    } finally {
      fs.readdirSync = readdirSync;
    }

    expect(read.some(dir => dir.includes('node_modules'))).to.be(false);
    expect(read.some(dir => dir.endsWith(path.join('lib', 'test')))).to.be(false);
  });

  it('still applies patterns that depend on the end of the path', function() {
    const res = filePaths.getSync(['proj'], {
      ext: ['.js', '.ts', '.mjs'],
      ignore: ['node_modules', '\\.mjs$'],
    }).sort();
    expect(res).to.eql(expected('a.js', 'lib/b.ts', 'lib/test/d.js'));
  });

  it('returns files passed directly, regardless of extension or ignore', function() {
    const file = path.join('proj', 'notes.txt');
    expect(filePaths.getSync([file], opts())).to.eql([file]);
  });

  it('throws for a path that does not exist', function() {
    const fn = () => filePaths.getSync(['missing'], opts());
    expect(fn).to.throwException(/No such file or directory: missing/);
  });
});
