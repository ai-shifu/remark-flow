import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractVariableNames,
  formatVariableAssignment,
  InteractionParser,
  normalizeVariableName,
  readVariableMarker,
} from '../src/index';

interface ContractCases {
  normalization: Array<{ raw: string; name: string | null }>;
  extraction: Array<{ source: string; names: string[] }>;
  interactions: Array<{
    source: string;
    name: string;
    buttons: string[];
    values: string[];
  }>;
}

const cases: ContractCases = JSON.parse(
  readFileSync(
    path.join(process.cwd(), 'tests/fixtures/variable-name-cases.json'),
    'utf8'
  )
);

describe('the shared MarkdownFlow variable-name contract', () => {
  test.each(cases.normalization)('normalizes $raw', ({ raw, name }) => {
    expect(normalizeVariableName(raw)).toBe(name);
    const assignment = formatVariableAssignment(raw);
    if (name === null) {
      expect(assignment).toBeNull();
    } else {
      expect(readVariableMarker(assignment!, 1)?.name).toBe(name);
    }
  });

  test.each(cases.extraction)('extracts $source', ({ source, names }) => {
    expect(extractVariableNames(source)).toEqual(names);
  });

  test.each(cases.interactions)(
    'parses $source',
    ({ source, name, buttons, values }) => {
      expect(new InteractionParser().parseToRemarkFormat(source)).toEqual({
        variableName: name,
        buttonTexts: buttons,
        buttonValues: values,
        isMultiSelect: false,
      });
    }
  );
});
