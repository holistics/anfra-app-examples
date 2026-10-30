"""Generate the fictional presenter's portrait locally with RealVisXL (SDXL). No external API.

    .venv/bin/python face_gen.py [count]
"""
import sys, torch
from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

n = int(sys.argv[1]) if len(sys.argv) > 1 else 4
pipe = StableDiffusionXLPipeline.from_pretrained("SG161222/RealVisXL_V5.0", torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
pipe.enable_model_cpu_offload()
prompt = ("RAW photo, head and shoulders portrait of a friendly Vietnamese man in his late twenties, indie software founder, "
          "short black hair, warm natural smile, looking straight at the camera, mouth closed, wearing a dark green hoodie, "
          "cozy home office background softly out of focus, laptop and a plant, warm window light, soft even light on the face, "
          "natural skin texture, 50mm lens, shallow depth of field, centered, front facing")
negative = ("cartoon, painting, illustration, 3d render, deformed, extra fingers, glasses, hat, text, watermark, blurry face, "
            "open mouth, teeth, profile, side view, harsh shadows, oversaturated")
for i in range(n):
    g = torch.Generator("cuda").manual_seed(1000 + i)
    img = pipe(prompt, negative_prompt=negative, width=1024, height=1024, num_inference_steps=30, guidance_scale=5.0, generator=g).images[0]
    img.save(f"assets/face/face_{i}.png")
    print("saved", i, flush=True)
