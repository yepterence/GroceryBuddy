import pytest

from items import normalize_item_name

pytestmark = pytest.mark.no_db


def test_lowercases():
    assert normalize_item_name("MILK") == "milk"
    assert normalize_item_name("Milk") == "milk"


def test_strips_leading_and_trailing_whitespace():
    assert normalize_item_name("  milk ") == "milk"


def test_collapses_internal_whitespace_including_tabs_and_newlines():
    assert normalize_item_name("Oat   Milk") == "oat milk"
    assert normalize_item_name("oat\t\nmilk") == "oat milk"


def test_variants_stay_distinct():
    assert normalize_item_name("2% Milk") == "2% milk"
    assert normalize_item_name("2% milk") != normalize_item_name("milk")
    assert normalize_item_name("Lactose-Free Milk") == "lactose-free milk"


def test_punctuation_is_kept():
    assert normalize_item_name("Ben & Jerry's") == "ben & jerry's"
