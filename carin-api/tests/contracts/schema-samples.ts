import { contracts } from '../../src/contracts/generated/schemas.js';

type Schema = {
  $ref?: string;
  const?: unknown;
  enum?: unknown[];
  anyOf?: Schema[];
  oneOf?: Schema[];
  type?: string;
  format?: string;
  pattern?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  minItems?: number;
  items?: Schema;
  minimum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
};
const definitions = contracts.schema.$defs as unknown as Record<string, Schema>;

/** Schema probes only: these samples assert wire shapes, never domain or AI quality. */
export function schemaSample(schema: Schema): unknown {
  if (schema.$ref) return schemaSample(definitions[schema.$ref.replace('#/$defs/', '')]);
  if ('const' in schema) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf)
    return schemaSample(schema.anyOf.find((value) => value.type === 'null') ?? schema.anyOf[0]);
  if (schema.oneOf) return schemaSample(schema.oneOf[0]);
  switch (schema.type) {
    case 'object':
      return Object.fromEntries(
        (schema.required ?? []).map((key) => [key, schemaSample(schema.properties![key])])
      );
    case 'array':
      return Array.from({ length: schema.minItems ?? 0 }, () => schemaSample(schema.items!));
    case 'integer':
    case 'number':
      return schema.minimum ?? (schema.exclusiveMinimum ?? 0) + 1;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'string': {
      if (schema.format === 'binary') return new Blob(['binary schema probe']);
      if (schema.format === 'uuid') return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      if (schema.format === 'date-time') return '2026-10-13T05:00:00Z';
      if (schema.format === 'date') return '2026-10-13';
      if (schema.format === 'email') return 'schema-probe@example.invalid';
      if (schema.format === 'uri') return 'https://schema-probe.example.invalid/resource';
      if (schema.pattern === '^[a-f0-9]{64}$') return 'a'.repeat(64);
      if (schema.pattern) return '12:30';
      return 'x'.repeat(Math.max(1, schema.minLength ?? 0));
    }
    default:
      return {};
  }
}
