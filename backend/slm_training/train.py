"""LoRA fine-tune Qwen2.5-0.5B-Instruct on the exported dataset, then merge to a plain HF model.
Every run starts again from the stock base on the FULL current dataset (no stacked adapters), so the
model follows syllabus/bank changes instead of drifting or forgetting."""
import argparse, os, random
import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
from common import BASE, load_jsonl, prompt_text, full_text

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True, help="dir with train.jsonl")
ap.add_argument("--out", required=True)
ap.add_argument("--epochs", type=float, default=3)
ap.add_argument("--lr", type=float, default=2e-4)
ap.add_argument("--max_len", type=int, default=768)
a = ap.parse_args()

tok = AutoTokenizer.from_pretrained(BASE)
dtype = torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float32
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=dtype)
model = get_peft_model(model, LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                                         target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]))


def encode(ex):
    p = tok(prompt_text(ex["messages"]), add_special_tokens=False)["input_ids"]
    f = tok(full_text(ex["messages"]), add_special_tokens=False)["input_ids"][: a.max_len]
    labels = [-100] * min(len(p), len(f)) + f[len(p):]      # loss on the assistant reply only
    return {"input_ids": f, "labels": labels[: len(f)]}


rows = load_jsonl(os.path.join(a.data, "train.jsonl"))
random.Random(0).shuffle(rows)
data = [encode(r) for r in rows]


def collate(batch):
    n = max(len(b["input_ids"]) for b in batch)
    pad = tok.pad_token_id
    return {
        "input_ids": torch.tensor([b["input_ids"] + [pad] * (n - len(b["input_ids"])) for b in batch]),
        "attention_mask": torch.tensor([[1] * len(b["input_ids"]) + [0] * (n - len(b["input_ids"])) for b in batch]),
        "labels": torch.tensor([b["labels"] + [-100] * (n - len(b["labels"])) for b in batch]),
    }


args = TrainingArguments(output_dir=os.path.join(a.out, "ckpt"), per_device_train_batch_size=8, gradient_accumulation_steps=2,
                         num_train_epochs=a.epochs, learning_rate=a.lr, lr_scheduler_type="cosine", warmup_ratio=0.05,
                         logging_steps=10, save_strategy="no", report_to=[], remove_unused_columns=False,
                         bf16=(dtype == torch.bfloat16))
Trainer(model=model, args=args, train_dataset=data, data_collator=collate).train()
merged = model.merge_and_unload()
merged.save_pretrained(os.path.join(a.out, "merged"))
tok.save_pretrained(os.path.join(a.out, "merged"))
print("merged model ->", os.path.join(a.out, "merged"))
