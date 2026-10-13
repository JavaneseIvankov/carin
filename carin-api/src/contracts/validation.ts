import { Ajv2020 } from 'ajv/dist/2020.js';
import { default as addFormatsModule } from 'ajv-formats';
import type { AnySchema, ValidateFunction } from 'ajv';
import { contracts } from './generated/schemas.js';

type Schema = Record<string, unknown>;
type ParameterSchema = Schema & { properties: Record<string, Schema>; required: string[] };
type Content = Record<string, Schema>;
export type OperationContract = {
  method: string;
  path: string;
  parameters: Record<'path' | 'query' | 'header', ParameterSchema>;
  request: { required: boolean; content: Content } | null;
  responses: Record<string, { content: Content; headers: ParameterSchema }>;
};
export type RequestInput = {
  path?: Record<string, unknown>;
  query?: Record<string, unknown> | URLSearchParams;
  headers?: Headers | Record<string, string>;
  body?: unknown;
  contentType?: string;
};
export type ResponseTransport = {
  contentType?: string;
  headers?: Headers | Record<string, string>;
};

// No coercion, defaults, or field removal: validation must never rewrite wire data.
const ajv = new Ajv2020({ allErrors: true, strictTypes: false });
const addFormats = addFormatsModule as unknown as (instance: Ajv2020) => void;
addFormats(ajv);
// Binary is checked by transport adapters before validating its string marker.
ajv.addFormat('binary', true);
ajv.addSchema(contracts.schema);
const operations = contracts.operations as Record<string, OperationContract>;
const compiled = new Map<Schema, ValidateFunction>();
function compile(schema: Schema): ValidateFunction {
  const cached = compiled.get(schema);
  if (cached) return cached;
  const validator = ajv.compile({ ...schema, $defs: contracts.schema.$defs } as AnySchema);
  compiled.set(schema, validator);
  return validator;
}
// Compile all operations up front, including endpoints not implemented yet.
for (const operation of Object.values(operations)) {
  Object.values(operation.parameters).forEach(compile);
  Object.values(operation.request?.content ?? {}).forEach(compile);
  for (const response of Object.values(operation.responses)) {
    compile(response.headers);
    Object.values(response.content).forEach(compile);
  }
}

export class ContractValidationError extends Error {
  constructor(readonly boundary: string) {
    // Do not include Ajv errors, property names, headers, or submitted payloads.
    super(`Contract validation failed: ${boundary}`);
    this.name = 'ContractValidationError';
  }
}

function validate(schema: Schema, value: unknown, boundary: string): void {
  if (!compile(schema)(value)) throw new ContractValidationError(boundary);
}
function operationFor(name: string): OperationContract {
  const operation = Object.hasOwn(operations, name) ? operations[name] : undefined;
  if (!operation) throw new Error(`Unknown operation: ${name}`);
  return operation;
}
export function contractOperations(): Array<{ id: string } & OperationContract> {
  return Object.entries(operations).map(([id, operation]) => ({ id, ...operation }));
}
export function validateSchema(name: string, value: unknown): void {
  if (!Object.hasOwn(contracts.schema.$defs, name)) throw new Error(`Unknown schema: ${name}`);
  const validator = ajv.getSchema(`${contracts.schema.$id}#/$defs/${name}`);
  if (!validator || !validator(value)) throw new ContractValidationError(name);
}

function serializedValue(value: string, schema: Schema, boundary: string): unknown {
  if (schema.type === 'integer') {
    if (!/^-?(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new ContractValidationError(boundary);
    }
    return Number(value);
  }
  if (schema.type === 'number') {
    if (!/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) {
      throw new ContractValidationError(boundary);
    }
    return Number(value);
  }
  if (schema.type === 'boolean') {
    if (value !== 'true' && value !== 'false') throw new ContractValidationError(boundary);
    return value === 'true';
  }
  return value;
}
function queryValues(
  query: RequestInput['query'],
  schema: ParameterSchema,
  boundary: string
): Record<string, unknown> {
  if (!(query instanceof URLSearchParams)) return query ?? {};
  const values: Record<string, unknown> = Object.create(null);
  for (const [name, value] of query) {
    if (Object.hasOwn(values, name)) throw new ContractValidationError(boundary);
    const definition = Object.hasOwn(schema.properties, name) ? schema.properties[name] : {};
    values[name] = serializedValue(value, definition, boundary);
  }
  return values;
}
function headerValues(
  headers: ResponseTransport['headers'],
  schema: ParameterSchema,
  boundary: string
): Record<string, unknown> {
  let normalized: Headers;
  try {
    normalized = new Headers(headers);
  } catch {
    throw new ContractValidationError(boundary);
  }
  const values: Record<string, unknown> = Object.create(null);
  for (const [name, definition] of Object.entries(schema.properties)) {
    const value = normalized.get(name);
    if (value !== null) values[name] = serializedValue(value, definition, boundary);
  }
  // Cookies, content-type, and other transport/vendor headers are not resource fields.
  return values;
}
function mediaType(contentType: string | undefined): string {
  return (contentType ?? 'application/json').split(';', 1)[0].trim().toLowerCase();
}
function transportBody(body: unknown, schema: Schema, media: string, boundary: string): unknown {
  if (schema.format === 'binary') {
    if (!(body instanceof Blob) && !(body instanceof Uint8Array))
      throw new ContractValidationError(boundary);
    return '';
  }
  if (media !== 'multipart/form-data') return body;
  if (!(body instanceof FormData)) throw new ContractValidationError(boundary);
  const properties = schema.properties as Record<string, Schema>;
  const value: Record<string, unknown> = Object.create(null);
  for (const [name, field] of body) {
    if (Object.hasOwn(value, name)) throw new ContractValidationError(boundary);
    if (properties[name]?.format === 'binary') {
      if (!(field instanceof Blob)) throw new ContractValidationError(boundary);
      value[name] = '';
    } else value[name] = field;
  }
  return value;
}
function validateBody(
  content: Content,
  body: unknown,
  contentType: string | undefined,
  boundary: string
): void {
  const media = mediaType(contentType);
  const schema = Object.hasOwn(content, media) ? content[media] : undefined;
  if (!schema) throw new ContractValidationError(`${boundary}.contentType`);
  validate(schema, transportBody(body, schema, media, boundary), boundary);
}

/** Validate decoded JSON, raw multipart, and distinct route/query/header parameters. */
export function validateRequest(
  name: string,
  input: RequestInput
): {
  path: Record<string, unknown>;
  query: Record<string, unknown>;
  headers: Record<string, unknown>;
  body: unknown;
} {
  const operation = operationFor(name);
  const path = input.path ?? {};
  const query = queryValues(input.query, operation.parameters.query, `${name}.query`);
  const headers = headerValues(input.headers, operation.parameters.header, `${name}.headers`);
  validate(operation.parameters.path, path, `${name}.path`);
  validate(operation.parameters.query, query, `${name}.query`);
  validate(operation.parameters.header, headers, `${name}.headers`);
  if (input.body === undefined) {
    if (operation.request?.required) throw new ContractValidationError(`${name}.body`);
  } else {
    if (!operation.request) throw new ContractValidationError(`${name}.body`);
    validateBody(operation.request.content, input.body, input.contentType, `${name}.body`);
  }
  return { path, query, headers, body: input.body };
}

/** Use the same response validator for fixture adapters, providers, and real AI. */
export function validateResponse(
  name: string,
  status: number,
  body: unknown,
  transport: ResponseTransport = {}
): void {
  const operation = operationFor(name);
  if (!Number.isInteger(status) || status < 100 || status > 599)
    throw new ContractValidationError(`${name}.status`);
  const response = operation.responses[String(status)] ?? operation.responses.default;
  if (!response) throw new ContractValidationError(`${name}.status`);
  const headers = headerValues(transport.headers, response.headers, `${name}.headers`);
  validate(response.headers, headers, `${name}.headers`);
  if (!Object.keys(response.content).length) {
    if (body !== undefined) throw new ContractValidationError(`${name}.body`);
    return;
  }
  validateBody(response.content, body, transport.contentType, `${name}.response`);
}
