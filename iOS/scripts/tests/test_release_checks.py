"""Exercise release metadata validation with a plist-backed plutil stub on Linux.

This checks shell logic only, not codesigning, provisioning, or an actual app archive.
"""
import os
from pathlib import Path
import plistlib
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
PRIVACY = SCRIPTS.parent / 'SailBrowser/Resources/PrivacyInfo.xcprivacy'


class ReleaseMetadataTests(unittest.TestCase):
    def check(self, updates=None, expected=None, privacy=True):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            app = root / 'Sail Browser.app'
            app.mkdir()
            info = {
                'CFBundleIdentifier': 'com.yoyovich.sail', 'CFBundleDisplayName': 'Sail',
                'CFBundleName': 'Sailfish', 'ITSAppUsesNonExemptEncryption': False,
                'LSApplicationCategoryType': 'public.app-category.utilities', 'UIDeviceFamily': [1, 2],
                'UISupportedInterfaceOrientations': ['UIInterfaceOrientationPortrait'],
                'UISupportedInterfaceOrientations~ipad': ['UIInterfaceOrientationPortrait',
                    'UIInterfaceOrientationPortraitUpsideDown', 'UIInterfaceOrientationLandscapeLeft',
                    'UIInterfaceOrientationLandscapeRight'],
                'CFBundleURLTypes': [{'CFBundleURLSchemes': ['http', 'https']}],
                'CFBundleShortVersionString': '0.1.0', 'CFBundleVersion': '1',
            }
            info.update(updates or {})
            (app / 'Info.plist').write_bytes(plistlib.dumps(info))
            if privacy:
                (app / 'PrivacyInfo.xcprivacy').write_bytes(PRIVACY.read_bytes())
            bin_dir = root / 'bin'
            bin_dir.mkdir()
            # plutil is Apple-only; read the real test plists instead of hardcoding successful responses.
            plutil = bin_dir / 'plutil'
            plutil.write_text('''#!/usr/bin/env python3
import sys, plistlib
try:
    value = plistlib.loads(open(sys.argv[-1], 'rb').read())
    for key in sys.argv[2].split('.'):
        value = value[int(key)] if isinstance(value, list) else value[key]
    print(str(value).lower() if isinstance(value, bool) else value)
except (KeyError, IndexError, ValueError):
    sys.exit(1)
''')
            plutil.chmod(0o755)
            codesign = bin_dir / 'codesign'
            codesign.write_text('#!/bin/sh\nexit 1\n')
            codesign.chmod(0o755)
            env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'])
            env.pop('SAIL_EXPECTED_BUNDLE_IDENTIFIER', None)
            if expected is not None:
                env['SAIL_EXPECTED_BUNDLE_IDENTIFIER'] = expected
            return subprocess.run(['bash', str(SCRIPTS / 'check-release.sh'), str(app)],
                                  env=env, capture_output=True, text=True)

    def test_personal_fork_metadata_is_accepted(self):
        self.assertEqual(self.check().returncode, 0)

    def test_wrong_app_identity_is_rejected(self):
        result = self.check({'CFBundleIdentifier': 'com.other.browser'})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('CFBundleIdentifier', result.stderr)

    def test_custom_identity_override_is_accepted(self):
        self.assertEqual(self.check({'CFBundleIdentifier': 'org.example.browser'},
                                    expected='org.example.browser').returncode, 0)

    def test_invalid_versions_are_rejected(self):
        for updates in ({'CFBundleVersion': '0'}, {'CFBundleShortVersionString': 'not-a-version'}):
            with self.subTest(updates=updates):
                self.assertNotEqual(self.check(updates).returncode, 0)

    def test_missing_privacy_manifest_is_rejected(self):
        result = self.check(privacy=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('PrivacyInfo.xcprivacy', result.stderr)


if __name__ == '__main__':
    unittest.main()
