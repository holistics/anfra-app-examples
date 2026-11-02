"""Draw the player avatars: apps/shared/art/avatar-1.svg … avatar-5.svg.

Half-body busts in the app's palette, with a white rim around the figure and a few gold sparkles.
Original designs (not taken from any game).

    python3 tools/build_avatars.py
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'apps' / 'shared' / 'art'

SKINS = {'light': ('#F2CDB0', '#E2B08E'), 'warm': ('#E0A97F', '#C98F68'), 'tan': ('#C98B62', '#B2754F'),
         'deep': ('#8E5B3E', '#77482F'), 'rose': ('#EBC0A6', '#D9A386')}


def face(skin, eyes='smile', glasses=None, blush='#DE8F67', freckles=False):
    s, sd = SKINS[skin]
    parts = [
        f'<rect x="51" y="78" width="18" height="22" rx="7" fill="{sd}"/>',          # neck
        f'<ellipse cx="35.5" cy="62" rx="4.5" ry="6" fill="{sd}"/><ellipse cx="84.5" cy="62" rx="4.5" ry="6" fill="{sd}"/>',
        f'<ellipse cx="60" cy="58" rx="24" ry="27" fill="{s}"/>',                   # head
        f'<ellipse cx="46" cy="68" rx="5" ry="3" fill="{blush}" opacity=".45"/><ellipse cx="74" cy="68" rx="5" ry="3" fill="{blush}" opacity=".45"/>',
        '<path d="M53 72 Q60 78 67 72" fill="none" stroke="#6B4434" stroke-width="2.2" stroke-linecap="round"/>',
    ]
    if eyes == 'smile':
        parts.append('<path d="M45 60 q4 -4 8 0 M67 60 q4 -4 8 0" fill="none" stroke="#3E3036" stroke-width="2.4" stroke-linecap="round"/>')
    else:
        parts.append('<circle cx="49" cy="59" r="2.6" fill="#3E3036"/><circle cx="71" cy="59" r="2.6" fill="#3E3036"/>'
                     '<circle cx="50" cy="58" r=".8" fill="#fff"/><circle cx="72" cy="58" r=".8" fill="#fff"/>')
    if freckles:
        parts.append('<g fill="#B5773E" opacity=".6"><circle cx="45" cy="65" r=".9"/><circle cx="48" cy="67" r=".9"/><circle cx="43" cy="68" r=".9"/>'
                     '<circle cx="75" cy="65" r=".9"/><circle cx="72" cy="67" r=".9"/><circle cx="77" cy="68" r=".9"/></g>')
    if glasses:
        parts.append(f'<g fill="none" stroke="{glasses}" stroke-width="2"><circle cx="49" cy="59" r="7"/><circle cx="71" cy="59" r="7"/><path d="M56 59 h8"/></g>')
    return ''.join(parts)


def bust(fill, collar=''):
    return f'<path d="M12 140 C14 112 34 97 60 97 C86 97 106 112 108 140 Z" fill="{fill}"/>{collar}'


AVATARS = [
    # name, background, back hair, body, face, front hair / extras
    ('Rowan', '#F6E7C4',
     '<path d="M34 60 C30 30 46 22 60 22 C76 22 90 32 86 60 C84 74 92 92 98 104 C84 100 80 86 80 70 L40 70 C40 86 36 100 22 104 C28 92 36 76 34 60 Z" fill="#C9C3B4"/>',
     bust('#E8C88A', '<path d="M46 99 L60 120 L74 99" fill="#FBF6EA"/><path d="M60 120 V140" stroke="#B98550" stroke-width="2"/><circle cx="60" cy="128" r="2" fill="#B98550"/>'),
     face('rose', glasses='#3C7980'),
     '<path d="M36 52 C36 30 50 26 60 26 C72 26 86 32 84 52 C76 40 66 36 58 38 C50 40 42 44 36 52 Z" fill="#DDD8CC"/>'),
    ('Idris', '#DCEBEA',
     '',
     bust('#5EA3A6', '<path d="M30 112 C40 104 50 101 60 101 C70 101 80 104 90 112" fill="none" stroke="#3C7980" stroke-width="3"/><path d="M38 124 h44 M34 132 h52" stroke="#4E9295" stroke-width="2.5"/>'),
     face('tan', eyes='dots'),
     '<path d="M40 70 C40 88 50 96 60 96 C70 96 80 88 80 70 C76 80 70 84 60 84 C50 84 44 80 40 70 Z" fill="#3E3036"/>'
     '<path d="M52 76 Q60 72 68 76" fill="none" stroke="#3E3036" stroke-width="3"/>'
     '<path d="M34 50 C34 26 86 26 86 50 L86 54 L34 54 Z" fill="#DE8F67"/><rect x="32" y="48" width="56" height="9" rx="4" fill="#B9704F"/>'
     '<circle cx="60" cy="24" r="5" fill="#F6EBCF"/>'),
    ('Nia', '#F8DCD3',
     '<circle cx="60" cy="20" r="15" fill="#3E2C2A"/>',
     bust('#DE8F67', '<path d="M42 100 v40 M78 100 v40" stroke="#B9704F" stroke-width="5"/><rect x="46" y="118" width="28" height="22" rx="3" fill="#E9A07D"/><circle cx="46" cy="112" r="2.4" fill="#F6EBCF"/><circle cx="74" cy="112" r="2.4" fill="#F6EBCF"/>'),
     face('deep', freckles=False, blush='#C0614A'),
     '<path d="M36 56 C34 34 48 30 60 30 C74 30 88 36 84 56 C80 44 70 40 60 41 C50 42 40 46 36 56 Z" fill="#3E2C2A"/>'
     '<circle cx="78" cy="30" r="3" fill="#E8C88A"/>'),
    ('Safa', '#E4EDD8',
     '<path d="M28 70 C26 34 44 24 60 24 C76 24 94 34 92 70 C92 92 100 104 106 118 L14 118 C20 104 28 92 28 70 Z" fill="#8FAA6E"/>',
     bust('#B5773E', '<path d="M44 100 L60 128 L76 100" fill="#8FAA6E"/><path d="M34 118 v22 M86 118 v22" stroke="#9A6233" stroke-width="2"/>'),
     face('warm', eyes='dots'),
     '<path d="M34 58 C34 34 48 30 60 30 C72 30 86 34 86 58 C86 44 76 36 60 36 C44 36 34 44 34 58 Z" fill="#7E9B5F"/>'
     '<path d="M30 66 C30 84 40 92 46 96 L36 100 C30 92 28 80 30 66 Z M90 66 C90 84 80 92 74 96 L84 100 C90 92 92 80 90 66 Z" fill="#8FAA6E"/>'),
    ('Ash', '#DCE6F0',
     '',
     bust('#FBF6EA', '<g stroke="#8FB8C8" stroke-width="4"><path d="M18 128 H102"/><path d="M24 116 H96"/></g>'
          '<path d="M40 100 C44 112 52 116 60 116 C68 116 76 112 80 100 C74 106 66 108 60 108 C54 108 46 106 40 100 Z" fill="#DE8F67"/>'
          '<path d="M74 108 L82 136 L90 132 Z" fill="#DE8F67"/>'),
     face('light', freckles=True),
     '<path d="M34 56 C30 30 48 24 62 26 C78 28 90 38 84 58 C82 46 76 40 68 40 C62 46 50 48 40 46 C38 50 36 52 34 56 Z" fill="#C9763E"/>'
     '<path d="M58 28 C64 22 74 24 76 30" fill="none" stroke="#C9763E" stroke-width="5" stroke-linecap="round"/>'),
]

SPARKLE = 'M0 -6 C1 -1.5 1.5 -1 6 0 C1.5 1 1 1.5 0 6 C-1 1.5 -1.5 1 -6 0 C-1.5 -1 -1 -1.5 0 -6 Z'
SPARKS = [(18, 30, .9), (100, 22, 1.2), (106, 70, .7), (14, 84, .6), (92, 46, .5)]

for i, (name, bg, back, body, fc, front) in enumerate(AVATARS, 1):
    sparks = ''.join(f'<path d="{SPARKLE}" transform="translate({x} {y}) scale({k})" fill="#E8C88A"/>' for x, y, k in SPARKS)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 140" width="120" height="140">
<!-- Wanderleaf player avatar "{name}" (tools/build_avatars.py) -->
<defs><filter id="rim" x="-10%" y="-10%" width="120%" height="120%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="d"/>
  <feFlood flood-color="#FFFFFF"/><feComposite in2="d" operator="in" result="w"/>
  <feMerge><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter><clipPath id="card"><rect width="120" height="140" rx="14"/></clipPath></defs>
<g clip-path="url(#card)"><rect width="120" height="140" fill="{bg}"/>{sparks}
<g filter="url(#rim)">{back}{body}{fc}{front}</g></g>
</svg>'''
    (OUT / f'avatar-{i}.svg').write_text(svg)
    print('avatar', i, name)
