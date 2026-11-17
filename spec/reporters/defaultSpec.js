const expect          = require('expect.js');
const fixtures        = require('../fixtures');
const helpers         = require('../helpers');
const DefaultReporter = require('../../lib/reporters/default');
const Inspector       = require('../../lib/inspector');
const path            = require('path');

const intersectionPath = path.join('spec', 'fixtures', 'intersection.js');

describe('DefaultReporter', function() {
  afterEach(function() {
    helpers.restoreOutput();
  });

  describe('constructor', function() {
    it('accepts an inspector as an argument', function() {
      const inspector = new Inspector(['']);
      const reporter = new DefaultReporter(inspector);
      expect(reporter._inspector).to.be(inspector);
    });
  });

  it('prints the summary on end', function() {
    helpers.captureOutput();
    const inspector = new Inspector([fixtures.intersection], {
      threshold: 40
    });
    const reporter = new DefaultReporter(inspector);

    inspector.run();
    helpers.restoreOutput();

    expect(helpers.getOutput()).to.be('\nNo matches found across 1 file\n');
  });

  describe('given a match', function() {
    beforeEach(function() {
      helpers.captureOutput();
    });

    it('prints the instances', function() {
      const inspector = new Inspector([fixtures.intersection], {
        threshold: 15
      });
      const reporter = new DefaultReporter(inspector);

      inspector.removeAllListeners('end');
      inspector.run();
      helpers.restoreOutput();

      const expected = `
------------------------------------------------------------

Match - 2 instances

${intersectionPath}:1,5
function intersectionA(array1, array2) {
  array1.filter(function(n) {
    return array2.indexOf(n) != -1;
  });
}

${intersectionPath}:7,11
function intersectionB(arrayA, arrayB) {
  arrayA.filter(function(n) {
    return arrayB.indexOf(n) != -1;
  });
}
`;

      expect(helpers.getOutput()).to.be(expected);
    });
  });
});
