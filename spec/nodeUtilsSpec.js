const expect    = require('expect.js');
const fixtures  = require('./fixtures');
const helpers   = require('./helpers');
const NodeUtils = require('../lib/nodeUtils');

describe('NodeUtils', function() {
  describe('walkSubtrees', function() {
    it('walks each child node using DFS', function() {
      const res = [];
      const root = helpers.parse(fixtures.simple)[0];
      NodeUtils.walkSubtrees(root, node => res.push(node.type));
      expect(res).to.eql([
        'ExpressionStatement',
        'UpdateExpression',
        'Identifier',
        'ExpressionStatement',
        'CallExpression',
        'Identifier'
      ]);
    });
  });

  describe('getDFSTraversal', function() {
    it('returns the DFS traversal of the AST', function() {
      const ast = helpers.parse(fixtures.simple)[0];
      const res = NodeUtils.getDFSTraversal(ast).map(node => node.type);
      expect(res).to.eql([
        'BlockStatement',
        'ExpressionStatement',
        'UpdateExpression',
        'Identifier',
        'ExpressionStatement',
        'CallExpression',
        'Identifier'
      ]);
    });
  });

  describe('getBFSTraversal', function() {
    it('returns the BFS traversal of the AST', function() {
      const ast = helpers.parse(fixtures.simple)[0];
      const res = NodeUtils.getBFSTraversal(ast).map(node => node.type);
      expect(res).to.eql([
        'BlockStatement',
        'ExpressionStatement',
        'ExpressionStatement',
        'UpdateExpression',
        'CallExpression',
        'Identifier',
        'Identifier'
      ]);
    });
  });

  describe('getChildren', function() {
    it('returns the children of a Node', function() {
      const parent = helpers.parse(fixtures.intersection)[0];
      const res = NodeUtils.getChildren(parent);
      // Children should be the three identifiers intersectionA,
      // array1, and array2, followed by a block statement
      expect(res.map(node => node.type)).to.eql([
        'Identifier',
        'Identifier',
        'Identifier',
        'BlockStatement'
      ])
    });

    it('ignores null children', function() {
      const parent = helpers.parse(fixtures.nullChildren)[1].expression.left;
      // parent.elements is an array with a leading null that should be ignored,
      // followed by an identifier
      const res = NodeUtils.getChildren(parent);
      expect(res).to.have.length(1);
      expect(res[0].type).to.be('Identifier');
    });

    it('ignores empty JSXText nodes', function() {
      const parent = helpers.parse(fixtures.jsxNesting)[0].expression;
      const res = NodeUtils.getChildren(parent);
      res.forEach(node => expect(node.type).not.to.be('JSXText'));
    });
  });

  describe('isBefore', function() {
    describe('given nodes with different line numbers', function() {
      it('returns true if the first node has a lower line number', function() {
        const res = NodeUtils.isBefore(
          {loc: {start: {line: 0, column: 0}}},
          {loc: {start: {line: 1, column: 0}}}
        );
        expect(res).to.be(true);
      });

      it('returns false if the first node has a higher numbered line', function() {
        const res = NodeUtils.isBefore(
          {loc: {start: {line: 1, column: 0}}},
          {loc: {start: {line: 0, column: 0}}}
        );
        expect(res).to.be(false);
      });
    });

    describe('given nodes with the same line number', function() {
      it('returns true if the first node has a lower column number', function() {
        const res = NodeUtils.isBefore(
          {loc: {start: {line: 0, column: 0}}},
          {loc: {start: {line: 0, column: 1}}}
        );
        expect(res).to.be(true);
      });

      it('returns false if the first node has a higher column number', function() {
        const res = NodeUtils.isBefore(
          {loc: {start: {line: 0, column: 1}}},
          {loc: {start: {line: 0, column: 0}}}
        );
        expect(res).to.be(false);
      });
    });
  });

  describe('isES6ModuleImport', function() {
    it('returns true for an import declaration', function() {
      // ImportDeclaration
      const nodes = [helpers.parse(fixtures.es6Module)[0]];
      expect(NodeUtils.isES6ModuleImport(nodes)).to.be(true);
    });

    it('returns false for export declaration', function() {
      // ExportNamedDeclaration
      const nodes = [helpers.parse(fixtures.es6Module)[1]];
      expect(NodeUtils.isES6ModuleImport(nodes)).to.be(false);
    });

    it('returns false otherwise', function() {
      const nodes = helpers.parse(fixtures.commonjs);
      expect(NodeUtils.isES6ModuleImport(nodes)).to.be(false);
    });
  });

  describe('isAMD', function() {
    it('returns true for an expression containing a define', function() {
      // First expression is define
      const nodes = [helpers.parse(fixtures.amd)[0]];
      expect(NodeUtils.isAMD(nodes)).to.be(true);
    });

    it('returns true for an expression containing a define', function() {
      // Third expression is require
      const nodes = [helpers.parse(fixtures.amd)[2]];
      expect(NodeUtils.isAMD(nodes)).to.be(true);
    });

    it('returns true even if the function is a property', function() {
      const nodes = [helpers.parse(fixtures.amd)[4]];
      expect(NodeUtils.isAMD(nodes)).to.be(true);
    });

    it('returns true even if a nested property', function() {
      const nodes = [helpers.parse(fixtures.amd)[6]];
      expect(NodeUtils.isAMD(nodes)).to.be(true);
    });

    it('returns false otherwise', function() {
      const nodes = helpers.parse(fixtures.commonjs);
      expect(NodeUtils.isAMD(nodes)).to.be(false);
    });
  });

  describe('isCommonJS', function() {
    it('returns true for an expression containing a require', function() {
      // First node is an ExpressionStatement
      const nodes = [helpers.parse(fixtures.commonjs)[0]];
      expect(NodeUtils.isCommonJS(nodes)).to.be(true);
    });

    it('returns true for a declaration containing a require', function() {
      // Second node is a constiableDeclaration
      const nodes = [helpers.parse(fixtures.commonjs)[1]];
      expect(NodeUtils.isCommonJS(nodes)).to.be(true);
    });

    it('returns false otherwise', function() {
      const nodes = helpers.parse(fixtures.amd);
      expect(NodeUtils.isCommonJS(nodes)).to.be(false);
    });
  });

  describe('typesMatch', function() {
    it('returns true if all node types match', function() {
      const res = NodeUtils.typesMatch([
        {type: 'a'}, {type: 'a'}, {type: 'a'}
      ]);
      expect(res).to.be(true);
    });

    it('returns false if not all node types match', function() {
      const res = NodeUtils.typesMatch([
        {type: 'a'}, {type: 'a'}, {type: 'b'}
      ]);
      expect(res).to.be(false);
    });
  });

  describe('identifiersMatch', function() {
    it('returns true if all node are matching identifiers', function() {
      const res = NodeUtils.identifiersMatch([
        {name: 'a'}, {name: 'a'}, {name: 'a'}
      ]);
      expect(res).to.be(true);
    });

    it('returns false if not all node names match', function() {
      const res = NodeUtils.identifiersMatch([
        {name: 'a'}, {name: 'a'}, {name: 'b'}
      ]);
      expect(res).to.be(false);
    });
  });

  describe('literalsMatch', function() {
    it('returns true if all literals have the same value', function() {
      const res = NodeUtils.literalsMatch([
        {type: 'Literal', value: 'a'},
        {type: 'Literal', value: 'a'},
        {type: 'Literal', value: 'a'}
      ]);
      expect(res).to.be(true);
    });

    it('returns false if not all literals have the same value', function() {
      const res = NodeUtils.literalsMatch([
        {type: 'Literal', value: 'a'},
        {type: 'Literal', value: 'a'},
        {type: 'Literal', value: 'b'}
      ]);
      expect(res).to.be(false);
    });

    it('treats JSXText as a literal', function() {
      const res = NodeUtils.literalsMatch([
        {type: 'JSXText', value: 'a'},
        {type: 'JSXText', value: 'a'},
        {type: 'JSXText', value: 'b'}
      ]);
      expect(res).to.be(false);
    });

    it('ignores the values of nodes which are not literals', function() {
      const res = NodeUtils.literalsMatch([
        {type: 'Foo', value: 'a'},
        {type: 'Foo', value: 'a'},
        {type: 'Foo', value: 'b'}
      ]);
      expect(res).to.be(true);
    });
  });
});
