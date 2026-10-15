import type { operations } from './generated/app-api';
import { appOperations } from './generated/operations';

export type AppOperation = keyof operations;
type Parameter<
  Operation extends AppOperation,
  Kind extends keyof operations[Operation]['parameters'],
> = NonNullable<operations[Operation]['parameters'][Kind]>;
type Body<Operation extends AppOperation> = operations[Operation] extends {
  requestBody: { content: infer Content };
}
  ? Content[keyof Content]
  : never;
type Group<Kind extends string, Value> = [Value] extends [never]
  ? { [Key in Kind]?: never }
  : Partial<Value> extends Value
    ? { [Key in Kind]?: Value }
    : { [Key in Kind]: Value };

export type AppRequestInput<Operation extends AppOperation> = Group<
  'path',
  Parameter<Operation, 'path'>
> &
  Group<'query', Parameter<Operation, 'query'>> &
  Group<'headers', Parameter<Operation, 'header'>> &
  Group<'body', Body<Operation>>;
export type PreparedAppRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | FormData | undefined;
};

/** Resource API transport only. The generated internal AI types expose no AI client. */
export function prepareAppRequest<Operation extends AppOperation>(
  name: Operation,
  input: AppRequestInput<Operation>
): PreparedAppRequest {
  if (!Object.hasOwn(appOperations, name)) throw new Error('Unknown app operation');
  const operation = appOperations[name];
  const values = input as {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
    headers?: Record<string, string>;
    body?: unknown;
  };
  const path = operation.path.replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = values.path?.[key];
    if (value === undefined) throw new Error('Missing path parameter');
    return encodeURIComponent(String(value));
  });
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values.query ?? {})) {
    if (value !== undefined) query.set(key, String(value));
  }
  const headers = { ...values.headers };
  let body: PreparedAppRequest['body'];
  if (values.body !== undefined) {
    if (operation.contentType === 'multipart/form-data') {
      const form = new FormData();
      for (const [key, value] of Object.entries(values.body as Record<string, string | Blob>)) {
        form.append(key, value);
      }
      body = form;
    } else {
      body = JSON.stringify(values.body);
      headers['content-type'] = 'application/json';
    }
  }
  return { method: operation.method, path: path + (query.size ? `?${query}` : ''), headers, body };
}
