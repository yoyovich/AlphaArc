"""Validate native .strings resources and localization of app-owned visible labels."""
import json
from pathlib import Path
import re
import unittest

APP = Path(__file__).resolve().parents[2] / 'SailBrowser'
PAIR = re.compile(r'("(?:[^"\\]|\\.)*")\s*=\s*("(?:[^"\\]|\\.)*")\s*;')


def strings(path):
    text = re.sub(r'/\*.*?\*/', '', path.read_text(encoding='utf-8'), flags=re.S)
    matches = list(PAIR.finditer(text))
    if PAIR.sub('', text).strip():
        raise ValueError(f'Invalid strings syntax in {path}')
    items = [(json.loads(match[1]), json.loads(match[2])) for match in matches]
    if len(items) != len(dict(items)):
        raise ValueError(f'Duplicate localization key in {path}')
    return dict(items)


def placeholders(text):
    return sorted(re.findall(r'%(?:\d+\$)?(?:lld|ld|@|d|f)', text.replace('%%', '')))


class LocalizationTests(unittest.TestCase):
    def test_english_and_russian_have_identical_keys_and_format_arguments(self):
        for name in ('Localizable.strings', 'InfoPlist.strings'):
            en = strings(APP / 'Resources/en.lproj' / name)
            ru = strings(APP / 'Resources/ru.lproj' / name)
            self.assertEqual(en.keys(), ru.keys())
            for key in en:
                with self.subTest(key=key):
                    self.assertTrue(ru[key].strip())
                    self.assertEqual(placeholders(en[key]), placeholders(ru[key]))

    def test_literal_swiftui_labels_are_translated(self):
        ru = strings(APP / 'Resources/ru.lproj/Localizable.strings')
        call = re.compile(r'\b(?:Text|Button|Toggle|SettingsLabel|Label|ContentUnavailableView|LabeledContent|DisclosureGroup|navigationTitle|accessibilityLabel|accessibilityHint)\("([^"\\]*)"')
        missing = []
        for path in (APP / 'UI').rglob('*.swift'):
            if 'Debug' in path.name:
                continue
            for match in call.finditer(path.read_text()):
                if match[1] and match[1] not in ru:
                    missing.append((path.name, match[1]))
        self.assertEqual(missing, [])

    def test_app_owned_uikit_localization_keys_exist(self):
        ru = strings(APP / 'Resources/ru.lproj/Localizable.strings')
        missing = []
        for path in APP.rglob('*.swift'):
            for match in re.finditer(r'L10n\.(?:text|format)\("((?:[^"\\]|\\.)*)"', path.read_text()):
                key = json.loads('"' + match[1] + '"')
                if key not in ru:
                    missing.append((path.name, key))
        self.assertEqual(missing, [])

    def test_permission_descriptions_are_localized(self):
        ru = strings(APP / 'Resources/ru.lproj/InfoPlist.strings')
        self.assertEqual(set(ru), {'NSCameraUsageDescription', 'NSMicrophoneUsageDescription',
            'NSLocationWhenInUseUsageDescription', 'NSPhotoLibraryAddUsageDescription', 'NSLocalNetworkUsageDescription'})
        self.assertTrue(all(re.search('[А-Яа-яЁё]', value) for value in ru.values()))



if __name__ == '__main__':
    unittest.main()
