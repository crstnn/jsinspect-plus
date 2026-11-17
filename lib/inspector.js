const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const parse = require('./parser').parse;
const Match = require('./match');
const NodeUtils = require('./nodeUtils');
const crypto = require('crypto');
const stable = require('stable');

class Inspector extends EventEmitter {
  /**
   * Creates a new Inspector, which extends EventEmitter. filePaths is expected
   * to be an array of string paths. Also accepts an options object with any
   * combination of the following: threshold, identifiers literals, and
   * minInstances. Threshold indicates the minimum number of nodes to analyze.
   * Identifiers indicates whether the nodes in a match should also have
   * matching identifiers, and literals whether literal values should
   * match. minInstances specifies the min number of instances for a match.
   * An instance of Inspector emits the following events: start, match and end.
   *
   * @constructor
   * @extends EventEmitter
   *
   * @param {string[]} filePaths The files on which to run the inspector
   * @param {object}   [opts]    Options to set for the inspector
   */
  constructor(filePaths, opts) {
    super();
    opts = opts || {};

    this._filePaths = filePaths || [];
    this._threshold = opts.threshold || 30;
    this._identifiers = opts.identifiers;
    this._literals = opts.literals;
    this._minInstances = opts.minInstances || 2;
    this._map = Object.create(null);
    this._fileContents = {};
    this._traversals = {};
    this._positions = new Map();
    this.numFiles = this._filePaths.length;
  }

  /**
   * Runs the inspector on the given file paths, as provided in the constructor.
   * Emits a start event, followed by a series of match events for any detected
   * similarities, and an end event on completion.
   *
   * @fires Inspector#start
   * @fires Inspector#match
   * @fires Inspector#end
   */
  run() {
    this.emit('start');

    // File contents are split to allow for specific line extraction
    this._filePaths.forEach((filePath) => {
      const src = fs.readFileSync(filePath, {encoding: 'utf8'});
      this._fileContents[filePath] = src.split('\n');
      try {
        var syntaxTree = parse(src, filePath);
      } catch (err) {
        return console.error(err.message);
      }
      this._setTraversal(filePath, NodeUtils.getDFSTraversal(syntaxTree));
      this._walk(syntaxTree, (nodes) => this._insert(nodes));
    });

    this._analyze();
    this.emit('end');
  }

  /**
   * Stores a file's traversal and each node's index in it.
   *
   * @private
   *
   * @param {string} filePath
   * @param {Node[]} traversal
   */
  _setTraversal(filePath, traversal) {
    const previous = this._traversals[filePath];
    if (previous) {
      previous.forEach(node => this._positions.delete(node));
    }

    this._traversals[filePath] = traversal;

    // Comments can appear twice; keep the first
    traversal.forEach((node, i) => {
      if (!this._positions.has(node)) {
        this._positions.set(node, i);
      }
    });
  }

  /**
   * Returns a node's index in its file's traversal, or -1 if it isn't there.
   *
   * @private
   *
   * @param   {Node} node
   * @returns {int}
   */
  _getPosition(node) {
    const position = this._positions.get(node);
    return position === undefined ? -1 : position;
  }

  /**
   * Walks a given node's AST, building up arrays of nodes that meet the
   * inspector's threshold. When found, the callback is invoked and passed
   * the array of nodes.
   *
   * @private
   *
   * @param {Node}     node The node to traverse
   * @param {function} fn   The callback to invoke
   */
  _walk(node, fn) {
    NodeUtils.walkSubtrees(node, (node, parent, ancestors) => {
      const state = ancestors.concat(node);
      if (NodeUtils.isAMD(state) ||
        NodeUtils.isCommonJS(state) ||
        NodeUtils.isES6ModuleImport(state) ||
        NodeUtils.isES6ClassBoilerplate(state)) {
        return;
      }

      const nodes = NodeUtils.getDFSTraversal(node, this._threshold);
      if (nodes.length === this._threshold) {
        fn(nodes);
      }

      // TODO: Revisit logic
      // Disabled for performance reasons
      // this._walkSiblings(node, fn);
    });
  }

  /**
   * Walks sibling nodes under a parent, grouping their DFS traversals, and
   * invoking the callback for those that wouldn't otherwise meet the threshold.
   * Helpful for nodes like BlockStatements that hold a sequence. Note that
   * this will generate overlapping instances, and so _omitOverlappingInstances
   * helps cleanup the results.
   *
   * @private
   *
   * @param {Node}     node The node to traverse
   * @param {function} fn   The callback to invoke
   */
  _walkSiblings(parent, fn) {
    // group siblings that wouldn't otherwise meet threshold
    const children = NodeUtils.getChildren(parent);
    const n = this._threshold;

    for (let i = 0; i < children.length - 1; i++) {
      let nodes = NodeUtils.getDFSTraversal(children[i], n);
      if (nodes.length === n) continue;

      for (let j = i + 1; j < children.length; j++) {
        nodes = nodes.concat(NodeUtils.getDFSTraversal(children[j], n));
        if (nodes.length >= n) {
          fn(nodes.slice(0, n));
          break;
        }
      }
    }
  }

  /**
   * Generates a key based on the combined types of each of the supplied nodes.
   * Pushes the array to another array at the generated key in _map. Nodes
   * are updated to keep a reference to all their occurrences in _map.
   *
   * @private
   *
   * @param {Node[]} nodes
   */
  _insert(nodes) {
    const key = this._getMapKey(nodes);

    nodes.forEach(node => {
      if (!node.occurrences) {
        node.occurrences = {};
      }
      if (!node.occurrences[key]) {
        node.occurrences[key] = [];
      }
      node.occurrences[key].push(nodes);
    });

    // Set for O(1) removal
    if (!this._map[key]) {
      this._map[key] = new Set();
    }

    this._map[key].add(nodes);
  }

  /**
   * Traverses the keys at which the various nodes are stored. A key containing
   * an array of more than a single entry indicates a potential match. The nodes
   * are then grouped if identifier matching is enabled. A match results in the
   * relevant nodes being removed from any future results. This pruning ensures
   * that we only include the greatest common parent in a set of matches.
   *
   * @private
   *
   * @fires Inspector#match
   */
  _analyze() {
    const keys = Object.keys(this._map)
      .filter(key => this._map[key].size >= this._minInstances);

    // Need to use a stable sort to ensure parent nodes are traversed
    // before children when lengths are equal
    const sortedKeys = stable(keys, (a, b) => {
      return this._map[b].size - this._map[a].size;
    });

    for (let key of sortedKeys) {
      if (!this._map[key] || this._map[key].size < this._minInstances) {
        continue;
      }

      let nodeArrays = this._omitOverlappingInstances([...this._map[key]]);

      // groups will be of type Node[][][]
      let groups = [nodeArrays];
      if (this._identifiers) {
        groups = this._groupByMatchingIdentifiers(groups);
      }
      if (this._literals) {
        groups = this._groupByMatchingLiterals(groups);
      }

      for (let i = 0; i < groups.length; i++) {
        if (groups[i].length < this._minInstances) continue;

        this._expand(groups[i]);
        let match = new Match(groups[i]);
        match.populateLines(this._fileContents);
        this.emit('match', match);
        this._prune(groups[i]);
      }
    }
  }

  /**
   * Returns the node arrays without overlapping instances. That is, if one
   * instance has nodes 'abcd', and another has 'bcde', then 'bcde' is left out.
   *
   * @private
   *
   * @param   {Node[][]} nodeArrays
   * @returns {Node[][]}
   */
  _omitOverlappingInstances(nodeArrays) {
    const set = new Set();

    return nodeArrays.filter((nodes) => {
      if (nodes.some(node => set.has(node))) return false;
      nodes.forEach(node => set.add(node));
      return true;
    });
  }

  /**
   * Iterates over the multidimensional array of nodes, and returns a new
   * array grouping them based on matching identifiers.
   *
   * @private
   *
   * @param   {Node[][][]} groups
   * @returns {Node[][][]}
   */
  _groupByMatchingIdentifiers(groups) {
    return this._group(groups, (nodes) => {
      return nodes
        .filter(node => node.name)
        .map(node => node.name)
        .join(':');
    });
  }

  /**
   * Iterates over the multidimensional array of nodes, and returns a new
   * array grouping them based on matching literals.
   *
   * @private
   *
   * @param   {Node[][][]} groups
   * @returns {Node[][][]}
   */
  _groupByMatchingLiterals(groups) {
    return this._group(groups, (nodes) => {
      return nodes
        .filter(node => node.type.includes('Literal'))
        .map(node => node.value)
        .join(':');
    });
  }

  /**
   * Expands each instance of a match to the largest common sequence of nodes
   * with the same type, and optionally identifiers. Each array of nodes is
   * modified in place.
   *
   * @private
   *
   * @param {Node[][]} nodeArrays
   */
  _expand(nodeArrays) {
    const traversals = nodeArrays.map(nodes => {
      return this._traversals[nodes[0].loc.filename];
    });

    let headPositions = nodeArrays.map(nodes => this._getPosition(nodes[0]));

    let tailPositions = nodeArrays.map(nodes => {
      return this._getPosition(nodes[nodes.length - 1]);
    });

    // All nodes in any instance
    const included = new Set();
    nodeArrays.forEach(array => array.forEach(node => included.add(node)));

    const incr = (pos) => pos + 1;
    const decr = (pos) => pos - 1;
    const getNode = (pos, i) => traversals[i][pos];
    const alreadyIncluded = (nodes) => nodes.some(node => included.has(node));
    const include = (nodes) => nodes.forEach(node => included.add(node));

    const isComplete = (nodes) => {
      return (!NodeUtils.typesMatch(nodes) || alreadyIncluded(nodes)) ||
        (this._identifiers && !NodeUtils.identifiersMatch(nodes)) ||
        (this._literals && !NodeUtils.literalsMatch(nodes));
    };

    while (true) {
      headPositions = headPositions.map(decr);
      let nodes = headPositions.map(getNode);
      if (isComplete(nodes)) break;
      nodeArrays.forEach((array, i) => array.unshift(nodes[i]));
      include(nodes);
    }

    while (true) {
      tailPositions = tailPositions.map(incr);
      let nodes = tailPositions.map(getNode);
      if (isComplete(nodes)) break;
      nodeArrays.forEach((array, i) => array.push(nodes[i]));
      include(nodes);
    }
  }

  /**
   * Removes the nodes from consideration in any additional matches.
   *
   * @private
   *
   * @param {Node[][]} nodeArrays
   */
  _prune(nodeArrays) {
    for (let i = 0; i < nodeArrays.length; i++) {
      let nodes = nodeArrays[i];
      for (let j = 0; j < nodes.length; j++) {
        this._removeNode(nodes[j]);
      }
    }
  }

  /**
   * Removes all occurrences of a given node.
   *
   * @private
   *
   * @param {Node} node The node to remove
   */
  _removeNode(node) {
    for (let key in node.occurrences) {
      for (let i = 0; i < node.occurrences[key].length; i++) {
        if (!this._map[key]) break;
        this._map[key].delete(node.occurrences[key][i]);

        // Delete empty buckets
        if (!this._map[key].size) {
          delete this._map[key];
        }
      }

      delete node.occurrences[key];
    }
  }

  /**
   * Generates a key based on the type of each of the passed nodes, returned
   * as a base64-encoded sha1 hash.
   *
   * @private
   *
   * @param   {Node[]} nodes The nodes for which to generate the key
   * @returns {string}
   */
  _getMapKey(nodes) {
    let key = nodes[0].type;
    const length = nodes.length;

    // Significantly faster than a map & join
    for (let i = 1; i < length; i++) {
      key += ':' + nodes[i].type;
    }

    // Prefer shorter key lengths (base64 < hex)
    return crypto.createHash('sha1').update(key).digest('base64');
  }

  /**
   * Accepts a multidimensional array of nodes and groups them based on the
   * supplied function, which is expected to return a string.
   *
   * @private
   *
   * @param   {Node[][][]} groups The groups of nodes to further group
   * @param   {function}   fn     Synchronous function for generating group ids
   * @returns {Node[][][]}
   */
  _group(groups, fn) {
    const res = [];
    let map = Object.create(null);

    for (let i = 0; i < groups.length; i++) {
      for (let j = 0; j < groups[i].length; j++) {
        let id = fn(groups[i][j]);
        if (!map[id]) {
          map[id] = [];
        }

        map[id].push(groups[i][j]);
      }

      for (let key in map) {
        res.push(map[key]);
      }

      map = Object.create(null);
    }

    return res;
  }
}

module.exports = Inspector;
