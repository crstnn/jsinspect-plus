const expect       = require('expect.js');
const concat       = require('concat-stream')
const fixtures     = require('../fixtures');
const helpers      = require('../helpers');
const JSONReporter = require('../../lib/reporters/json');
const Inspector    = require('../../lib/inspector');
const path         = require('path');

const smallLinesPath = path.join('spec', 'fixtures', 'smallLines.js');

describe('JSONReporter', function() {
  afterEach(function() {
    helpers.restoreOutput();
  });

  describe('constructor', function() {
    it('accepts an inspector as an argument', function() {
      const inspector = new Inspector(['']);
      const reporter = new JSONReporter(inspector);
      expect(reporter._inspector).to.be(inspector);
    });
  });

  it('prints valid json', function() {
    const inspector = new Inspector([fixtures.smallLines], {
      threshold: 1
    });
    const reporter = new JSONReporter(inspector);

    helpers.captureOutput();
    inspector.run();
    helpers.restoreOutput();

    JSON.parse(helpers.getOutput());
  });

  describe('given a match', function() {
    beforeEach(function() {
      helpers.captureOutput();
    });

    it('prints the instances and their location', function() {
      const inspector = new Inspector([fixtures.smallLines], {
        threshold: 1
      });
      const reporter = new JSONReporter(inspector);
      const matches = helpers.collectMatches(inspector);

      inspector.removeAllListeners('start');
      inspector.removeAllListeners('end');

      inspector.run();
      helpers.restoreOutput();

      const parsedOutput = JSON.parse(helpers.getOutput());
      expect(parsedOutput).to.eql({
        id: '8ee1b37f99571a8917be385c2924f659762c1349',
        instances: [
          {
            path: smallLinesPath,
            lines: [1,1],
            code: 'test = function() { return 1; };'
          },
          {
            path: smallLinesPath,
            lines: [2,2],
            code: 'test = function() { return 2; };'
          },
          {
            path: smallLinesPath,
            lines: [3,3],
            code: 'test = function() { return 3; };'
          }
        ]
      });
    });
  });

  it('can write to a custom stream', function(done) {
    const inspector = new Inspector([fixtures.smallLines], {
      threshold: 1
    });
    const concatStream = concat(onFinish);
    const reporter = new JSONReporter(inspector, {
      writableStream: concatStream
    });
    const matches = helpers.collectMatches(inspector);

    inspector.run();

    function onFinish(data) {
      expect(JSON.parse(data)[0].id).to.be(
        '8ee1b37f99571a8917be385c2924f659762c1349'
      );
      done();
    }
  });
});
