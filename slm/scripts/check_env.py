"""Check the workstation can train on an RTX 5070 (Blackwell, sm_120)."""
import sys

import torch

ok = True
print(f"python {sys.version.split()[0]}  torch {torch.__version__}  cuda {torch.version.cuda}")
if not torch.cuda.is_available():
    sys.exit("CUDA not available - install the cu128 PyTorch build (see requirements.txt)")

name = torch.cuda.get_device_name(0)
cap = torch.cuda.get_device_capability(0)
vram = torch.cuda.get_device_properties(0).total_memory / 2**30
print(f"gpu {name}  sm_{cap[0]}{cap[1]}  {vram:.1f} GB  bf16={torch.cuda.is_bf16_supported()}")

if f"sm_{cap[0]}{cap[1]}" not in torch.cuda.get_arch_list():
    print("FAIL: this torch build has no kernels for your GPU - reinstall from the cu128 index")
    ok = False

try:
    torch.ones(1024, 1024, device="cuda") @ torch.ones(1024, 1024, device="cuda")
    print("matmul on GPU: ok")
except RuntimeError as e:
    print(f"FAIL: GPU matmul: {e}")
    ok = False

try:
    import bitsandbytes as bnb
    print(f"bitsandbytes {bnb.__version__}")
    bnb.optim.AdamW8bit([torch.nn.Parameter(torch.ones(8, device="cuda"))])
except Exception as e:
    print(f"FAIL: bitsandbytes: {e}")
    ok = False

try:
    import unsloth  # noqa: F401
    print("unsloth: ok")
except Exception as e:
    print(f"FAIL: unsloth: {e}")
    ok = False

sys.exit(0 if ok else 1)
