#!/usr/bin/env python3
"""Faux outil de traduction par IA (SEFARIA_GNOME_AI_COMMAND) : lit l'invite sur l'entrée
standard, l'enregistre (FAKE_AI_LOG) et répond par un JSON « [IA] segment N »."""

import json
import os
import re
import sys
import time

prompt = sys.stdin.read()
log = os.environ.get('FAKE_AI_LOG')
if log:
    with open(log, 'a', encoding='utf-8') as f:
        f.write(json.dumps({'tool': sys.argv[1] if len(sys.argv) > 1 else '', 'prompt': prompt}) + '\n')
time.sleep(float(os.environ.get('FAKE_AI_DELAY', '0.5')))
only = re.search(r'uniquement le segment \[([^\]]+)\]', prompt)
labels = [only.group(1)] if only else re.findall(r'^\[([^\]]+)\]', prompt, re.M)
print('Voici la traduction :\n```json')
text = 'verset seul' if only else 'segment'
print(json.dumps({label: f'[IA] traduction du {text} {label}' for label in labels}, ensure_ascii=False))
print('```')
