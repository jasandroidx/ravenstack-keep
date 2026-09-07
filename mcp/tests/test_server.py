import pytest
from src.server import _manhattan

def test_manhattan():
    # Same point
    assert _manhattan((0, 0), (0, 0)) == 0
    # Positive coordinates
    assert _manhattan((1, 2), (4, 6)) == 7
    # Negative coordinates
    assert _manhattan((-1, -2), (-4, -6)) == 7
    # Mixed coordinates
    assert _manhattan((-1, 2), (4, -6)) == 13
    # Order doesn't matter
    assert _manhattan((1, 2), (4, 6)) == _manhattan((4, 6), (1, 2))
