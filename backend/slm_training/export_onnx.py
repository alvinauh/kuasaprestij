"""merged HF model -> the files Transformers.js expects: onnx/model_q4.onnx + config/tokenizer json."""
import argparse, os, shutil, subprocess, sys
import onnx
try:  # newer onnxruntime renamed the module + class
    from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer as MatMul4BitsQuantizer
except ImportError:
    from onnxruntime.quantization.matmul_4bits_quantizer import MatMul4BitsQuantizer

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
tmp = os.path.join(a.out, "_fp32")
subprocess.check_call([sys.executable, "-m", "optimum.exporters.onnx", "--model", a.model,
                       "--task", "text-generation-with-past", tmp])
q = MatMul4BitsQuantizer(onnx.load(os.path.join(tmp, "model.onnx")), block_size=32, is_symmetric=True)
q.process()
os.makedirs(os.path.join(a.out, "onnx"), exist_ok=True)
q.model.save_model_to_file(os.path.join(a.out, "onnx", "model_q4.onnx"), use_external_data_format=False)
for f in ("config.json", "tokenizer.json", "tokenizer_config.json", "generation_config.json"):
    shutil.copy(os.path.join(tmp, f) if os.path.exists(os.path.join(tmp, f)) else os.path.join(a.model, f), a.out)
shutil.rmtree(tmp)
print("size MB:", os.path.getsize(os.path.join(a.out, "onnx", "model_q4.onnx")) // 2**20)
