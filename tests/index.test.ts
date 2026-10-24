import {
  remarkCustomVariable,
  remarkFlow,
  remarkInteraction,
  findDocumentVariableMarkers,
  type VariableMarker,
} from '../src/index';
import defaultExport from '../src/index';

describe('index exports', () => {
  test('exports a typed document marker reader', () => {
    const markers: VariableMarker[] = findDocumentVariableMarkers('{{ q }}');
    expect(markers[0]).toEqual({ start: 0, end: 7, rawName: ' q ', name: 'q' });
  });
  test('should export remarkCustomVariable', () => {
    expect(typeof remarkCustomVariable).toBe('function');
  });

  test('should export remarkFlow', () => {
    expect(typeof remarkFlow).toBe('function');
  });

  test('should export remarkInteraction', () => {
    expect(typeof remarkInteraction).toBe('function');
  });

  test('should export remarkInteraction as default', () => {
    expect(defaultExport).toBe(remarkInteraction);
  });

  test('exported functions should be callable', () => {
    expect(() => remarkCustomVariable()).not.toThrow();
    expect(() => remarkFlow()).not.toThrow();
    expect(() => remarkInteraction()).not.toThrow();
  });

  test('exported functions should return functions', () => {
    const variablePlugin = remarkCustomVariable();
    const flowPlugin = remarkFlow();
    const interactionPlugin = remarkInteraction();

    expect(typeof variablePlugin).toBe('function');
    expect(typeof flowPlugin).toBe('function');
    expect(typeof interactionPlugin).toBe('function');
  });
});
