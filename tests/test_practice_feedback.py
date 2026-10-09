"""M1 checks content drift and escaped shared markup, not sales effectiveness."""
import copy
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from practice_feedback import load_guides, render_feedback


class FeedbackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = json.loads((ROOT / 'src/generated/content-manifest.json').read_text(encoding='utf-8'))['entries']
        cls.source = json.loads((ROOT / 'sales-knowledge-base/practice-guides.json').read_text(encoding='utf-8'))

    def test_complete_guides_and_rubric_links(self):
        guides = load_guides(self.entries)
        self.assertEqual(len(guides), 10)
        self.assertEqual(sum(len(g['examples']) for g in guides.values()), 30)
        for guide in guides.values():
            self.assertEqual(len(guide['rubric']), 5)
            self.assertEqual(guide['status'], 'editorial_draft')

    def test_rubric_drift_missing_explanation_and_false_review_fail(self):
        for mutation in ('rubric', 'explanation', 'review'):
            source = copy.deepcopy(self.source)
            guide = source['guides']['06-P01']
            if mutation == 'rubric':
                guide['rubric'][0]['description'] = 'Changed source criterion'
            elif mutation == 'explanation':
                del guide['examples'][0]['explanations']['criterion-1']
            else:
                guide['status'] = 'verified'
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                load_guides(self.entries, source)

    def test_escape_user_like_content_and_unavailable_coverage(self):
        guides = copy.deepcopy(load_guides(self.entries))
        guides['06-P01']['examples'][0]['answer'] = '<script>alert(1)</script>'
        markup = render_feedback('06-P01', guides)
        self.assertNotIn('<script>', markup)
        self.assertIn('&lt;script&gt;', markup)
        self.assertIn('data-guide-unavailable', render_feedback('01-P01', guides))
        self.assertIn('data-practice-comparison="FINAL_PROJECT"', render_feedback('FINAL_PROJECT', guides))


if __name__ == '__main__':
    unittest.main()
