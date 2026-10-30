# Writes the female body the 3D body map uses, as an OBJ for scripts/build-body-model.mjs: Anny (NAVER LABS, Apache-2.0,
# https://github.com/naver/anny), a parametric body built on MakeHuman's CC0 assets. An adult woman, slim, standing with
# her arms down and her legs together, smoothed once (Loop subdivision) so the glass outline stays round at any size.
#   uv venv -p 3.12 <venv> && VIRTUAL_ENV=<venv> uv pip install --index-url https://download.pytorch.org/whl/cpu \
#     --extra-index-url https://pypi.org/simple torch anny==0.6.1 trimesh
#   <venv>/bin/python scripts/generate-female-body.py <out.obj>
# Anny is Z-up, facing -y, in metres; the build script turns it Y-up facing +z.
import math
import sys

import anny
import torch
import trimesh

# Phenotypes are Anny's, each in [0, 1]: gender 1 is female.
PHENOTYPE = {'gender': 1, 'age': 0.55, 'muscle': 0.5, 'weight': 0.4, 'height': 0.65, 'proportions': 0.9}
# From Anny's rest pose (a T pose, forearms bent forward): upper arms down 30°, forearms straightened 40°, legs in 4°
# (each foot turned back by as much, so it stays flat).
ARM_DEGREES, FOREARM_DEGREES, LEG_DEGREES = 30, 40, 4


def rotation(axis, degrees):
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    i, j = {'x': (1, 2), 'y': (2, 0)}[axis]
    matrix = torch.eye(4)
    matrix[i, i], matrix[i, j], matrix[j, i], matrix[j, j] = c, -s, s, c
    return matrix


model = anny.Anny().to(dtype=torch.float32)
bones = list(model.bone_labels)
pose = torch.eye(4)[None, None].repeat(1, model.bone_count, 1, 1)
for side, sign in (('L', 1), ('R', -1)):
    pose[0, bones.index(f'upperarm01.{side}')] = rotation('y', sign * ARM_DEGREES)
    pose[0, bones.index(f'lowerarm01.{side}')] = rotation('x', FOREARM_DEGREES)
    pose[0, bones.index(f'upperleg01.{side}')] = rotation('y', sign * LEG_DEGREES)
    pose[0, bones.index(f'foot.{side}')] = rotation('y', -sign * LEG_DEGREES)
output = model(pose_parameters=pose, phenotype_kwargs={key: torch.tensor([float(value)]) for key, value in PHENOTYPE.items()})
mesh = trimesh.Trimesh(vertices=output['vertices'].squeeze(0).detach().numpy(), faces=model.faces.numpy(), process=False)
mesh.subdivide_loop(iterations=1).export(sys.argv[1])
print(f'wrote {sys.argv[1]}')
