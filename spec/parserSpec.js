const expect  = require('expect.js');
const Parser  = require('../lib/parser');

describe('parse', function() {
  const parses = (src, filePath) => () => Parser.parse(src, filePath);

  it('parses TS parameter decorators, as used by Angular and NestJS', function() {
    const src = `
      @Controller('users')
      class UsersController {
        constructor(@Inject(TOKEN) private readonly service: Service) {}
        findOne(@Param('id') id: string) { return id; }
      }`;
    expect(parses(src, 'users.controller.ts')).not.to.throwException();
  });

  it('parses Flow-typed JS', function() {
    const src = `// @flow
      type Props = {| name: ?string, ...Other |};
      function greet(props: Props): Promise<?string> { return null; }`;
    expect(parses(src, 'greet.js')).not.to.throwException();
  });

  it('parses generic arrow functions in .mts and .cts files', function() {
    const src = 'export const id = <T>(x: T): T => x;';
    expect(parses(src, 'id.mts')).not.to.throwException();
    expect(parses(src, 'id.cts')).not.to.throwException();
  });

  it('still parses JSX in .tsx files', function() {
    const src = 'export const el = <div>{(n as number)}</div>;';
    expect(parses(src, 'el.tsx')).not.to.throwException();
  });

  describe('on error', function() {
    const src = '[_, = [1, 2, 3];';
    const filePath = 'broken.js';

    it('includes the filename of the file that failed to parse', function() {
      const fn = () => Parser.parse(src, filePath);
      expect(fn).to.throwException((err) => {
        expect(err.message).to.contain(filePath);
      });
    });

    it('includes a caret pointing to the unexpected token', function() {
      const fn = () => Parser.parse(src, filePath);
      expect(fn).to.throwException((err) => {
        expect(err.message).to.contain(`${src}\n    ^`);
      });
    });

    it('does not include the src line if longer than 100 chars', function() {
      const src = ' '.repeat(100) + ']';
      const fn = () => Parser.parse(src, filePath);
      expect(fn).to.throwException((err) => {
        expect(err.message).not.to.contain(`^`);
      });
    });
  });
});
