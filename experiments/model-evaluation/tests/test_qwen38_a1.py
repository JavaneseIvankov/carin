import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parent.parent/"scripts"))
from run_evaluation import ProviderError, make_payload
from run_qwen38_a1 import MAX_MODEL, make_a1_call


def response():
    native={"is_food":True,"container_diameter_cm":20,"apparent_volume_cm3":100,"weight_g":80,
            "components":[{"name":"rice","mass_g":80}],
            "prediction":{"energy_kcal":104,"protein_g":2,"carbohydrate_g":22,"fat_g":0.2},"limitations":[]}
    return {"model":MAX_MODEL,"choices":[{"finish_reason":"stop","message":{"content":json.dumps(native)}}]}


class Qwen38Tests(unittest.TestCase):
    def test_same_payload_reaches_transport_and_original_envelope_is_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder); raw=response(); observed=[]
            def transport(url,key,payload,timeout,retries):
                observed.append(copy.deepcopy(payload))
                return raw,1
            call=make_a1_call("A1V1",directory,"synthetic-key",transport)
            call.sample_id="synthetic"
            payload=make_payload(MAX_MODEL,b"\x89PNG\r\n\x1a\nsynthetic","fixed prompt",1024,True,False)
            normalized,tries=call("https://example.test/v1","synthetic-key",payload,120,2)
            self.assertEqual(observed,[payload])
            self.assertEqual(tries,1)
            self.assertEqual(payload["temperature"],0)
            self.assertFalse(payload["enable_thinking"])
            self.assertEqual(payload["response_format"],{"type":"json_object"})
            self.assertEqual(json.loads(normalized["choices"][0]["message"]["content"])["prediction"]["mass_g"],80)
            self.assertEqual(json.loads((directory/"raw/synthetic.json").read_text()),raw)
            self.assertTrue((directory/"details/synthetic.json").exists())

    def test_invalid_geometry_keeps_raw_response_and_does_not_retry_or_repair(self):
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder); raw=response()
            native=json.loads(raw["choices"][0]["message"]["content"])
            native["prediction"]=None
            raw["choices"][0]["message"]["content"]=json.dumps(native)
            calls=[]
            def transport(*args): calls.append(args); return raw,1
            call=make_a1_call("A1V1",directory,"synthetic-key",transport);call.sample_id="synthetic"
            with self.assertRaises(ProviderError) as error:
                call("https://example.test/v1","synthetic-key",{},120,2)
            self.assertEqual(error.exception.code,"invalid_ablation_output")
            self.assertEqual(len(calls),1)
            self.assertTrue((directory/"raw/synthetic.json").exists())
            self.assertFalse((directory/"details/synthetic.json").exists())

    def test_wrong_provider_model_is_rejected_before_scoring(self):
        with tempfile.TemporaryDirectory() as folder:
            raw=response();raw["model"]="another-model"
            call=make_a1_call("A1V1",Path(folder),"synthetic-key",lambda *args:(raw,1));call.sample_id="synthetic"
            with self.assertRaises(ProviderError) as error:
                call("https://example.test/v1","synthetic-key",{},120,2)
            self.assertEqual(error.exception.code,"unexpected_provider_model")


if __name__=="__main__": unittest.main()
