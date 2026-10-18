"""Fine-tune Qwen2.5 (1.5B/3B) for Skor offline tasks on a 12 GB RTX 5070.

Input: data/skor_slm_dataset.jsonl with {"task", "lang", "messages": [...]} rows.
Output: LoRA adapter + Q4_K_M GGUF.
"""
import argparse
import subprocess
import sys
from pathlib import Path

import torch
from unsloth import FastLanguageModel
from unsloth.chat_templates import train_on_responses_only
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig

parser = argparse.ArgumentParser()
parser.add_argument("--model", default="unsloth/Qwen2.5-1.5B-Instruct")
parser.add_argument("--data", default="data/skor_slm_dataset.jsonl")
parser.add_argument("--epochs", type=float, default=2)
parser.add_argument("--max-seq-length", type=int, default=2048)
parser.add_argument("--out", default="skor_offline_slm")
parser.add_argument("--eval-out", default="data/skor_slm_eval.jsonl")
parser.add_argument("--llama-cpp", default="~/llama.cpp", help="llama.cpp checkout with build/bin/llama-quantize")
args = parser.parse_args()

# 1. Load 4-bit base model
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=args.model,
    max_seq_length=args.max_seq_length,
    dtype=None,
    load_in_4bit=True,
)

# 2. Add LoRA adapters
model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

# 3. Load dataset and render ChatML with the model's own template
def to_text(row):
    return {"text": tokenizer.apply_chat_template(row["messages"], tokenize=False)}

dataset = load_dataset("json", data_files=args.data, split="train")
dataset = dataset.map(to_text)
split = dataset.train_test_split(test_size=0.05, seed=3407)
# Held-out prompts for scripts/validate_gguf.py
split["test"].remove_columns("text").to_json(args.eval_out, force_ascii=False)

# 4. Train (12 GB VRAM: batch 4 x accum 2 fits 1.5B at 2048 tokens; use batch 2 x accum 4 for 3B)
trainer = SFTTrainer(
    model=model,
    processing_class=tokenizer,
    train_dataset=split["train"],
    eval_dataset=split["test"],
    args=SFTConfig(
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        per_device_train_batch_size=4,
        gradient_accumulation_steps=2,
        warmup_ratio=0.05,
        num_train_epochs=args.epochs,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=5,
        eval_strategy="steps",
        eval_steps=50,
        save_strategy="steps",
        save_steps=50,
        save_total_limit=2,
        output_dir="skor_slm_outputs",
        optim="adamw_8bit",
        seed=3407,
        report_to="none",
    ),
)

# Only learn the assistant's JSON, not the prompts
trainer = train_on_responses_only(
    trainer,
    instruction_part="<|im_start|>user\n",
    response_part="<|im_start|>assistant\n",
)

trainer.train()

# 5. Save adapter (for re-export/merging later) and Q4_K_M GGUF for llama.cpp
model.save_pretrained(f"{args.out}_lora")
tokenizer.save_pretrained(f"{args.out}_lora")
# Unsloth's save_pretrained_gguf falls back to `sudo apt-get` when its prebuilt llama.cpp
# download fails, which hangs forever without a TTY. Merge here, convert with a local build.
model.save_pretrained_merged(args.out, tokenizer, save_method="merged_16bit")
llama = Path(args.llama_cpp).expanduser()
bf16 = Path(f"{args.out}_bf16.gguf")
subprocess.run([sys.executable, str(llama / "convert_hf_to_gguf.py"), args.out,
                "--outtype", "bf16", "--outfile", str(bf16)], check=True)
subprocess.run([str(llama / "build/bin/llama-quantize"), str(bf16),
                f"{args.out}/{Path(args.out).name}.Q4_K_M.gguf", "Q4_K_M"], check=True)
bf16.unlink()
