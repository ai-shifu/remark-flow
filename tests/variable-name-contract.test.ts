import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractVariableNames,
  formatVariableAssignment,
  InteractionParser,
  normalizeVariableName,
  readVariableMarker,
} from '../src/index';
import remarkFlow from '../src/remark-flow';
import {
  createParentNode,
  createTextNode,
  findCustomVariableNodes,
} from './test-utils';

interface ContractCases {
  normalization: Array<{ raw: string; name: string | null }>;
  extraction: Array<{ source: string; names: string[] }>;
  document_context_cases: Array<{
    id: string;
    source: string;
    names: string[];
  }>;
  interactions: Array<{
    source: string;
    name: string;
    buttons: string[];
    values: string[];
  }>;
  boundary_cases: Array<{
    source: string;
    interaction_count: number;
    name?: string | null;
    buttons?: string[];
    values?: string[];
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

  test.each(cases.document_context_cases)(
    'preserves document literal boundaries in $id',
    ({ source, names }) => {
      expect(extractVariableNames(source)).toEqual(names);
    }
  );

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

  test.each(cases.boundary_cases)(
    'protects raw boundaries in $source',
    sample => {
      const tree = createParentNode([createTextNode(sample.source)]);
      remarkFlow()(tree);
      const found = findCustomVariableNodes(tree);
      expect(found).toHaveLength(sample.interaction_count);
      if (sample.interaction_count) {
        const expected = {
          buttonTexts: sample.buttons,
          buttonValues: sample.values,
          isMultiSelect: false,
        };
        expect(found[0].data.hProperties).toEqual(
          sample.name === null
            ? expected
            : { ...expected, variableName: sample.name }
        );
        const parsed = new InteractionParser().parseToRemarkFormat(
          sample.source
        );
        expect(parsed).toEqual(found[0].data.hProperties);
      }
    }
  );
});
