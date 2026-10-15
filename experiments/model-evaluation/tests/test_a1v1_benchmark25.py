import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"scripts"))
from run_a1v1_benchmark25 import FLASH, MAX, make_call, normalize_a1v1, response_format
from run_evaluation import ProviderError, make_payload


def envelope(food=True):
    native={"is_food":food,"container_diameter_cm":20 if food else None,
            "apparent_volume_cm3":100 if food else None,"weight_g":80 if food else None,
            "components":[{"name":"rice","mass_g":80}] if food else [],
            "prediction":{"energy_kcal":104 if food else None,"protein_g":2 if food else None,
                          "carbohydrate_g":22 if food else None,"fat_g":0.2 if food else None},"limitations":[]}
    return {"model":FLASH,"choices":[{"finish_reason":"stop","message":{"content":json.dumps(native)}}]}


class BenchmarkTests(unittest.TestCase):
    def test_strict_schema_reaches_both_models_without_reference_leakage(self):
        image=b"\x89PNG\r\n\x1a\nsynthetic"
        digest=hashlib.sha256(image).hexdigest()
        indexed={digest:{"sample_id":"reference-id-not-for-provider","image_sha256":digest,"reference":{"mass_g":999}}}
        for model in (FLASH,MAX):
            with self.subTest(model=model),tempfile.TemporaryDirectory() as folder:
                captured=[]; raw=envelope();raw["model"]=model
                def transport(url,key,payload,timeout,retries):
                    captured.append(copy.deepcopy(payload));return raw,1
                call=make_call(model,Path(folder),indexed,"synthetic-token",transport)
                payload=make_payload(model,image,"fixed JSON prompt",1024,True,False)
                normalized,attempts=call("https://example.test/v1","synthetic-token",payload,120,2)
                self.assertEqual(attempts,1)
                self.assertEqual(captured[0]["response_format"],response_format())
                self.assertTrue(captured[0]["response_format"]["json_schema"]["strict"])
                self.assertFalse(captured[0]["response_format"]["json_schema"]["schema"]["additionalProperties"])
                self.assertNotIn("reference-id-not-for-provider",json.dumps(captured[0]))
                self.assertNotIn("999",json.dumps(captured[0]))
                self.assertEqual(json.loads(normalized["choices"][0]["message"]["content"])["prediction"]["mass_g"],80)

    def test_nonfood_null_is_valid_and_geometry_must_be_null(self):
        response=envelope(False)
        normalized,details=normalize_a1v1(response)
        self.assertTrue(all(v is None for v in json.loads(normalized["choices"][0]["message"]["content"])["prediction"].values()))
        native=json.loads(response["choices"][0]["message"]["content"]);native["container_diameter_cm"]=20
        response["choices"][0]["message"]["content"]=json.dumps(native)
        with self.assertRaisesRegex(ValueError,"Nonfood geometry"):
            normalize_a1v1(response)

    def test_unrequested_fields_still_fail_and_raw_output_is_kept(self):
        image=b"\x89PNG\r\n\x1a\nsynthetic";digest=hashlib.sha256(image).hexdigest()
        raw=envelope();native=json.loads(raw["choices"][0]["message"]["content"])
        native["packing_factor"]=0.8;raw["choices"][0]["message"]["content"]=json.dumps(native)
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder)
            call=make_call(FLASH,directory,{digest:{"sample_id":"1"}},"synthetic-token",lambda *args:(raw,1))
            with self.assertRaises(ProviderError) as error:
                call("https://example.test/v1","synthetic-token",make_payload(FLASH,image,"JSON prompt",1024,True,False),120,2)
            self.assertEqual(error.exception.code,"invalid_a1v1_output")
            self.assertEqual(json.loads((directory/"raw/1.json").read_text()),raw)
            self.assertTrue((directory/"validation-errors/1.json").exists())
            self.assertFalse((directory/"details/1.json").exists())


if __name__=="__main__":unittest.main()
