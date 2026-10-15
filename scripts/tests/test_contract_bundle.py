import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'contract_bundle.py'
spec = importlib.util.spec_from_file_location('contract_bundle', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BundleTests(unittest.TestCase):
    def test_cross_document_refs_become_local_definitions(self):
        bundle = module.build_bundle()
        self.assertEqual(bundle['schema']['$schema'], 'https://json-schema.org/draft/2020-12/schema')
        self.assertEqual(bundle['schema']['$defs']['app.AnalysisJob']['properties']['result']['anyOf'][0]['$ref'], '#/$defs/ai.AnalysisResult')
        self.assertEqual(bundle['schema']['$defs']['ai.Error']['properties']['error']['properties']['details']['additionalProperties'], True)

    def test_all_operations_have_separate_request_and_response_schemas(self):
        bundle = module.build_bundle()
        operations = bundle['operations']
        self.assertEqual(len(operations), 40)
        upload = operations['app.uploadPhoto']
        self.assertEqual(upload['method'], 'post')
        self.assertEqual(upload['parameters']['header']['required'], ['idempotency-key'])
        self.assertEqual(upload['request']['content']['multipart/form-data']['properties']['file']['format'], 'binary')
        self.assertIn('200', operations['ai.analyzePhoto']['responses'])

    def test_pointer_array_indices_and_cyclic_non_schema_refs(self):
        document, pointer, value = module.resolve_ref('app', '#/components/schemas/ExaminationInput/oneOf/0')
        self.assertEqual(document, 'app')
        self.assertEqual(value['properties']['type']['enum'], ['pressure'])
        with self.assertRaisesRegex(ValueError, 'Cyclic'):
            self.cyclic_reference()

    def cyclic_reference(self):
        responses = module.DOCUMENTS['app']['components']['responses']
        original = responses['Error']
        try:
            responses['Error'] = {'$ref': '#/components/responses/Error'}
            return module.dereference({'$ref': '#/components/responses/Error'}, 'app')
        finally:
            responses['Error'] = original

    def test_remote_and_missing_references_fail_without_network(self):
        for ref in ['https://example.com/schema.json', '#/components/schemas/Missing', '../missing.yaml#/components/schemas/Foo']:
            with self.subTest(ref=ref), self.assertRaises(ValueError):
                module.resolve_ref('app', ref)


if __name__ == '__main__':
    unittest.main()
