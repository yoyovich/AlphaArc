"""Offline regression checks for the shipped filter-list conversion tools."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]


class PageShieldTests(unittest.TestCase):
    def convert(self, text):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'input.txt'
            source.write_text(text, encoding='utf-8')
            subprocess.run([sys.executable, '-I', str(SCRIPTS / 'page-shield.py'),
                            str(root), f'ads={source}'], check=True, capture_output=True)
            return json.loads((root / 'ads.json').read_text())

    def test_css_is_assigned_to_each_domain(self):
        result = self.convert('one.test,two.test##.advert\n')
        self.assertEqual(result['one.test'], result['two.test'])
        self.assertIn('display: none !important', result['one.test']['css'])

    def test_generic_rules_and_aliases(self):
        result = self.convert('##.global\na.test##.ad:contains(Sponsored)\n')
        self.assertIn('', result)
        self.assertEqual(result['a.test']['procedural'], ['.ad:has-text(Sponsored)'])

    def test_unsupported_or_negated_rules_are_not_broadened(self):
        self.assertEqual(self.convert('~safe.test##.ad\na.test##.ad:unknown(x)\n'), {})

    def test_procedural_not_is_not_inverted(self):
        self.assertEqual(self.convert('a.test##.ad:not(:has-text(foo))\n'), {})

    def test_scriptlet_alias_and_escaped_quote(self):
        result = self.convert("a.test#%#//scriptlet('ubo-set.js', 'flag', 'it\\'s')\n")
        self.assertEqual(result['a.test']['scriptlets'], [['set-constant', 'flag', "it's"]])

    def test_unknown_scriptlet_is_dropped(self):
        self.assertEqual(self.convert("a.test#%#//scriptlet('unknown', 'x')\n"), {})

    def test_malformed_rule_does_not_discard_following_rules(self):
        bad_rules = [
            "a.test#%#//scriptlet()", "a.test#%#//scriptlet('set-constant)",
            "a.test#%#//scriptlet('set-constant'", 'a.test#$#.ad',
            'a.test##.ad:has-text(unclosed',
        ]
        for bad in bad_rules:
            with self.subTest(rule=bad):
                result = self.convert(bad + '\nvalid.test##.ok\n')
                self.assertEqual(set(result), {'valid.test'})

    def test_all_bundled_rules_survive_conversion(self):
        resources = SCRIPTS.parent / 'SailBrowser/Resources/PageShield'
        for category in ('ads', 'trackers', 'cookieBanners'):
            with self.subTest(category=category):
                data = json.loads((resources / f'{category}.json').read_text())
                lines = []
                for host, rules in data.items():
                    lines.extend(host + '#$#' + css for css in rules.get('css', '').splitlines())
                    lines.extend(host + '##' + rule for rule in rules.get('procedural', []))
                    for call in rules.get('scriptlets', []):
                        args = ', '.join('"' + value.replace('"', '\\"') + '"' for value in call)
                        lines.append(host + '#%#//scriptlet(' + args + ')')
                self.assertEqual(self.convert('\n'.join(lines) + '\n'), data)

    def test_style_rules_are_preserved_and_remove_is_dropped(self):
        result = self.convert('a.test#$#.ad { color: red !important; }\nb.test#$#.ad { remove: true; }\n')
        self.assertEqual(result, {'a.test': {'css': '.ad { color: red !important; }'}})


class TrackerDomainsTests(unittest.TestCase):
    @staticmethod
    def rule(domain, action='block', **trigger):
        return {'trigger': {'url-filter': r'^[^:]+://+([^:/]+\.)?' +
                            domain.replace('.', r'\.') + '[/:]', **trigger},
                'action': {'type': action}}

    def convert(self, rules):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'rules.json'
            output = root / 'domains.txt'
            source.write_text(json.dumps(rules))
            subprocess.run([sys.executable, '-I', str(SCRIPTS / 'tracker-domains.py'),
                            str(output), str(source)], check=True, capture_output=True)
            return output.read_text().splitlines()

    def test_unconditional_rules_only_and_deduplication(self):
        self.assertEqual(self.convert([
            self.rule('z.test'), self.rule('a.test'), self.rule('z.test'),
            self.rule('conditional.test', **{'resource-type': ['script']}),
        ]), ['a.test', 'z.test'])

    def test_exceptions_remove_domains(self):
        self.assertEqual(self.convert([
            self.rule('allowed.test'), self.rule('allowed.test', 'ignore-previous-rules'),
            self.rule('blocked.test'),
        ]), ['blocked.test'])

    def test_subdomain_rules_keep_the_leading_dot(self):
        self.assertEqual(self.convert([
            {'trigger': {'url-filter': r'\.analytics\.test\/'}, 'action': {'type': 'block'}},
        ]), ['.analytics.test'])


if __name__ == '__main__':
    unittest.main()
