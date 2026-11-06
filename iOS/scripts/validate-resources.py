#!/usr/bin/env python3
"""Offline resource/utility validation; does not replace the Xcode test suite."""
import json
from pathlib import Path
import plistlib
import struct
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
RESOURCES = ROOT / 'iOS/SailBrowser/Resources'
CATEGORIES = {'ads', 'trackers', 'cookieBanners'}
SCRIPTLETS = {
    'set-constant', 'abort-on-property-read', 'abort-current-inline-script',
    'json-prune', 'remove-attr', 'remove-class', 'prevent-addEventListener', 'prevent-setTimeout',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run():
    json_paths = list((ROOT / 'iOS').rglob('*.json'))
    # Generated build/tool directories may contain unrelated JSON.
    json_paths = [p for p in json_paths if not any(part in {'.build', '.tools'} for part in p.parts)]
    for path in json_paths:
        json.loads(path.read_text(encoding='utf-8'))
    print(f'PASS: {len(json_paths)} JSON resources and fixtures')

    plists = [p for p in (ROOT / 'iOS').rglob('*')
              if p.suffix in {'.plist', '.entitlements', '.xcprivacy'}
              and not any(part in {'.build', '.tools'} for part in p.parts)]
    for path in plists:
        plistlib.loads(path.read_bytes())
    print(f'PASS: {len(plists)} plist/entitlement/privacy files')

    blocklists = RESOURCES / 'Blocklists'
    manifest = json.loads((blocklists / 'manifest.json').read_text())
    names = [entry['name'] for entry in manifest['lists']]
    require(len(names) == len(set(names)), 'Duplicate blocklist names')
    require({entry['category'] for entry in manifest['lists']} == CATEGORIES, 'Missing blocking category')
    paths = []
    total = 0
    for entry in manifest['lists']:
        name = entry['name']
        require(Path(name).name == name, 'Blocklist name must not be a path')
        path = blocklists / (name + '.json')
        rules = json.loads(path.read_text())
        require(isinstance(rules, list) and 0 < len(rules) < 150000, f'Rule limit: {name}')
        for index, rule in enumerate(rules):
            require(isinstance(rule.get('trigger', {}).get('url-filter'), str), f'{name}[{index}] URL filter')
            require(rule.get('action', {}).get('type') in {
                'block', 'block-cookies', 'css-display-none', 'ignore-previous-rules',
                'make-https', 'redirect', 'modify-headers',
            }, f'{name}[{index}] action')
        total += len(rules)
        paths.append(str(path))
    print(f'PASS: {len(paths)} WebKit lists, {total} rules; each below 150000')

    with tempfile.TemporaryDirectory() as folder:
        output = Path(folder) / 'tracker-domains.txt'
        subprocess.run([sys.executable, '-I', str(ROOT / 'iOS/scripts/tracker-domains.py'),
                        str(output), *paths], check=True)
        require(output.read_bytes() == (blocklists / 'tracker-domains.txt').read_bytes(),
                'Bundled tracker domains differ from generated domains')
        print(f'PASS: tracker regeneration, {len(output.read_text().splitlines())} domains')

    called = set()
    for category in sorted(CATEGORIES):
        data = json.loads((RESOURCES / 'PageShield' / (category + '.json')).read_text())
        for host, rules in data.items():
            require(set(rules) <= {'css', 'procedural', 'scriptlets'}, f'Unknown PageShield key: {host}')
            require(isinstance(rules.get('css', ''), str), f'CSS type: {host}')
            require(all(isinstance(s, str) for s in rules.get('procedural', [])), f'Procedural type: {host}')
            for call in rules.get('scriptlets', []):
                require(isinstance(call, list) and call and all(isinstance(a, str) for a in call),
                        f'Scriptlet arguments: {host}')
                require(call[0] in SCRIPTLETS, f'Unknown scriptlet: {call[0]}')
                called.add(call[0])
    require(called == SCRIPTLETS, 'Expected scriptlet coverage changed')
    print('PASS: PageShield schema and all 8 supported scriptlets')

    for asset in (RESOURCES / 'Assets.xcassets').rglob('Contents.json'):
        for image in json.loads(asset.read_text()).get('images', []):
            if 'filename' not in image:
                continue
            path = asset.parent / image['filename']
            require(path.is_file(), f'Missing image: {path}')
            if path.suffix.lower() == '.png':
                data = path.read_bytes()
                require(data[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG: {path}')
                width, height = struct.unpack('>II', data[16:24])
                if asset.parent.name == 'AppIcon.appiconset':
                    require((width, height) == (1024, 1024), f'App icon dimensions: {path}')
    print('PASS: asset references and 1024×1024 app icons')

    js = list(RESOURCES.rglob('*.js'))
    for path in js:
        subprocess.run(['node', '--check', str(path)], check=True)
    scripts = list((ROOT / 'iOS/scripts').glob('*.sh'))
    for path in scripts:
        subprocess.run(['bash', '-n', str(path)], check=True)
    print(f'PASS: syntax of {len(js)} JavaScript and {len(scripts)} shell scripts')


if __name__ == '__main__':
    try:
        run()
    except (OSError, ValueError, KeyError, TypeError, subprocess.CalledProcessError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
