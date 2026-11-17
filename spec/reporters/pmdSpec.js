const expect      = require('expect.js');
const fixtures    = require('../fixtures');
const helpers     = require('../helpers');
const PMDReporter = require('../../lib/reporters/pmd');
const Inspector   = require('../../lib/inspector');
const path        = require('path');

const smallLinesPath = path.join('spec', 'fixtures', 'smallLines.js');

describe('PMDReporter', function() {
  afterEach(function() {
    helpers.restoreOutput();
  });

  describe('constructor', function() {
    it('accepts an inspector as an argument', function() {

      const inspector = new Inspector(['']);
      const reporter = new PMDReporter(inspector);
      expect(reporter._inspector).to.be(inspector);
    });
  });

  describe('given a match', function() {
    beforeEach(function() {
      helpers.captureOutput();
    });

    it('prints paths and line numbers in a duplication element', function() {

      const inspector = new Inspector([fixtures.smallLines], {threshold: 1});
      const reporter = new PMDReporter(inspector);
      const matches = helpers.collectMatches(inspector);

      inspector.removeAllListeners('start');
      inspector.removeAllListeners('end');

      inspector.run();
      helpers.restoreOutput();

      const expected = helpers.trimlines(
        `<duplication lines="3" id="${matches[0].hash}">
        <file path="${fixtures.smallLines}" line="1"/>
        <file path="${fixtures.smallLines}" line="2"/>
        <file path="${fixtures.smallLines}" line="3"/>
        <codefragment>
        ${smallLinesPath}:1,1
        test = function() { return 1; };

        ${smallLinesPath}:2,2
        test = function() { return 2; };

        ${smallLinesPath}:3,3
        test = function() { return 3; };
        </codefragment>
        </duplication>
      `);

      expect(helpers.getOutput()).to.eql(expected);
    });
  });
});
