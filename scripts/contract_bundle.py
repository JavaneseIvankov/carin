"""Derive schema-only JSON Schema 2020-12 and self-contained OpenAPI type inputs.

Only the two checked-in contracts are allowed; reference resolution never uses network.
"""
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[1]
FILES = {'app': 'app-api.openapi.yaml', 'ai': 'ai-service.openapi.yaml'}
DOCUMENTS = {key: yaml.safe_load((ROOT / 'specs/contracts' / name).read_text())
             for key, name in FILES.items()}
METHODS = {'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'}


def resolve_ref(document, reference):
    parts = urlsplit(reference)
    if parts.scheme or parts.netloc or parts.query:
        raise ValueError(f'Nonlocal reference: {reference}')
    filename = parts.path.removeprefix('./')
    target = document if not filename else next(
        (key for key, name in FILES.items() if filename == name), None)
    if target is None or not parts.fragment.startswith('/'):
        raise ValueError(f'Unknown local reference: {reference}')
    pointer = unquote(parts.fragment)
    value = DOCUMENTS[target]
    try:
        for token in pointer[1:].split('/'):
            token = token.replace('~1', '/').replace('~0', '~')
            if isinstance(value, list):
                if not token.isdecimal() or (token.startswith('0') and token != '0'):
                    raise ValueError('Invalid array pointer')
                value = value[int(token)]
            else:
                value = value[token]
    except (KeyError, TypeError, IndexError) as error:
        raise ValueError(f'Unresolved reference: {reference}') from error
    return target, pointer, value


def rewrite(value, document, reference_fn):
    if isinstance(value, list):
        return [rewrite(item, document, reference_fn) for item in value]
    if not isinstance(value, dict):
        return value
    return {key: reference_fn(*resolve_ref(document, item)) if key == '$ref'
            else rewrite(item, document, reference_fn) for key, item in value.items()}


def schema_ref(document, pointer, _value):
    prefix = '/components/schemas/'
    if not pointer.startswith(prefix):
        raise ValueError(f'Expected schema reference, found {pointer}')
    return f'#/$defs/{document}.{pointer[len(prefix):]}'


def schema(value, document):
    return rewrite(value, document, schema_ref)


def dereference(value, document):
    visited = set()
    while '$ref' in value:
        reference = (document, value['$ref'])
        if reference in visited:
            raise ValueError('Cyclic non-schema reference')
        visited.add(reference)
        document, _pointer, value = resolve_ref(document, value['$ref'])
    return document, value


def parameter_object(parameters, location, document):
    properties, required = {}, []
    for parameter in parameters:
        origin, parameter = dereference(parameter, document)
        if parameter['in'] != location:
            continue
        name = parameter['name'].lower() if location == 'header' else parameter['name']
        properties[name] = schema(parameter['schema'], origin)
        if parameter.get('required'):
            required.append(name)
    return {'type': 'object', 'additionalProperties': False,
            'properties': properties, 'required': sorted(required)}


def media_content(content, document):
    return {media: schema(value['schema'], document) for media, value in content.items()}


def build_bundle():
    definitions, operations, type_documents = {}, {}, {}
    versions = {document['info']['version'] for document in DOCUMENTS.values()}
    if len(versions) != 1:
        raise ValueError('App/AI contract versions differ')
    version = versions.pop()
    for name, document in DOCUMENTS.items():
        # Validate every ref, including refs outside the schemas used below.
        rewrite(document, name, lambda target, pointer, value: pointer)
        for model, value in document['components']['schemas'].items():
            definitions[f'{name}.{model}'] = schema(value, name)
        for path, item in document['paths'].items():
            for method, operation in item.items():
                if method not in METHODS:
                    continue
                key = f"{name}.{operation['operationId']}"
                if key in operations:
                    raise ValueError(f'Duplicate operation: {key}')
                responses = {}
                for status, response in operation['responses'].items():
                    origin, response = dereference(response, name)
                    headers = [{'in': 'header', 'name': header, **definition}
                               for header, definition in response.get('headers', {}).items()]
                    responses[str(status)] = {
                        'content': media_content(response.get('content', {}), origin),
                        'headers': parameter_object(headers, 'header', origin)}
                request = None
                if 'requestBody' in operation:
                    origin, body = dereference(operation['requestBody'], name)
                    request = {'required': body.get('required', False),
                               'content': media_content(body['content'], origin)}
                parameters = item.get('parameters', []) + operation.get('parameters', [])
                operations[key] = {'method': method, 'path': path, 'request': request,
                                   'parameters': {location: parameter_object(parameters, location, name)
                                                  for location in ['path', 'query', 'header']},
                                   'responses': responses}
        # Bundle external schemas reachable from this document, preserving local refs.
        pending = set()

        def type_ref(target, pointer, value):
            prefix = '/components/schemas/'
            if not pointer.startswith(prefix):
                return '#' + pointer
            model = pointer[len(prefix):]
            if target != name:
                pending.add((target, model.split('/')[0]))
            return '#/components/schemas/' + ('' if target == name else target + '__') + model

        typed = rewrite(document, name, type_ref)
        included = set()
        while pending - included:
            source, model = sorted(pending - included)[0]
            included.add((source, model))
            typed['components']['schemas'][f'{source}__{model}'] = rewrite(
                DOCUMENTS[source]['components']['schemas'][model], source, type_ref)
        type_documents[name] = typed
    return {'version': version, 'schema': {'$schema': 'https://json-schema.org/draft/2020-12/schema',
            '$id': f'urn:carin:contracts:{version}', '$defs': definitions},
            'operations': operations, 'documents': type_documents}


if __name__ == '__main__':
    print(json.dumps(build_bundle(), sort_keys=True))
