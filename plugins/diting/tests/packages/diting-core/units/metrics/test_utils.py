import unittest
from diting_core.metrics.utils import fbeta_score


class TestFbetaScore(unittest.TestCase):
    def test_true_positive_only(self):
        # Only true positives
        self.assertEqual(fbeta_score(10, 0, 0, beta=1.0), 1.0)

    def test_true_positive_and_false_positive(self):
        # Some true positives and false positives
        self.assertAlmostEqual(fbeta_score(10, 5, 0, beta=1.0), 0.8)

    def test_no_true_positive(self):
        # No true positives
        self.assertEqual(fbeta_score(0, 5, 5, beta=1.0), 0.0)

    def test_no_true_positive_but_false_positive(self):
        # No true positives and some false positives
        self.assertEqual(fbeta_score(0, 5, 0, beta=1.0), 0.0)

    def test_no_true_positive_but_false_negative(self):
        # No true positives but some false negatives
        self.assertEqual(fbeta_score(0, 0, 5, beta=1.0), 0.0)

    def test_no_true_positive_no_false_positive_no_false_negative(self):
        # No true, false positives or negatives
        self.assertEqual(fbeta_score(0, 0, 0, beta=1.0), 0.0)

    def test_all_zero(self):
        # Edge case with all zeroes
        self.assertEqual(fbeta_score(0, 0, 0), 0.0)
