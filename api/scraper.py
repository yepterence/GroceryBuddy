#!/usr/bin/env python3
import argparse
import json
import string
import requests
import random
from datetime import datetime
from pathlib import Path

GROCERY_STORES = [
    "Sobeys",
    "Real_Canadian_Super_Store",
    "Costco",
    "Longos",
    "Farm_Boy",
    "Food_Basics",
    "FreshCo",
    "Central_Fresh_Market",
    "T&T_Supermarket",
    "Save_A_Lot_Grocery_Outlet",
    "Walmart",
    "M&M",
]

BASE_URL = "https://flyers-ng.flippback.com/api/flipp"


class Scraper:
    def __init__(self, locale, postal_code, stores=[]) -> None:
        self.locale = locale
        self.postal_code = postal_code
        self.base_url = BASE_URL
        self.stores = stores
        self.refresh_dt = ""
        self.all_flyers = []
        self.data_folder_path = Path.cwd() / "data"
        self.data_folder_path.mkdir(exist_ok=True)

    def construct_url(self, session):

        full_url = f"{self.base_url}/data?locale={self.locale}&postal_code={self.postal_code}&sid={session}"
        return full_url

    # Break down the steps and write down the steps for each problem.
    def retrieve_flyer_infos_from_json(self, flyer_json):
        """Retrieve necessary information for each flyer url from flyers_json and writes that to disk for later reference."""
        all_flyers = []
        flyer_list = flyer_json.get("flyers")
        for flyer in flyer_list:
            current_flyer = {}
            current_flyer_id = flyer.get("id")
            merchant = flyer.get("merchant")
            flyer_expiry = flyer.get("valid_to")
            merchant_id = flyer.get("merchant_id")
            valid_from = flyer.get("valid_from")
            flyer_name = flyer.get("name")
            categories = flyer.get("categories")
            current_flyer[merchant] = {
                "flyer_id": current_flyer_id,
                "valid_from": valid_from,
                "valid_to": flyer_expiry,
                "merchant_id": merchant_id,
                "flyer_merchant": merchant,
                "flyer_name": flyer_name,
                "categories": categories,
            }
            all_flyers.append(current_flyer)

        self.all_flyers = all_flyers
        save_folder_path = self.data_folder_path / "all_flyers.json"
        self.write_data_to_path(
            data=all_flyers,
            f_name=save_folder_path,
        )
        return all_flyers

    def retrieve_all_grocery_flyers(self):
        """Constructs url to retrieve flyer items for each store.
        Write store's flyer to json."""
        # save path should be unique enough so that it covers the time period
        # of the flyer.
        grocery_flyers = []
        for flyer in self.all_flyers:
            for flyer_details in flyer.values():
                if "Groceries" in flyer_details["categories"]:

                    flyer_dict = {}
                    f_id = flyer_details.get("flyer_id")
                    f_valid_to = datetime.fromisoformat(
                        flyer_details.get("valid_to")
                    ).date()
                    f_name = (
                        (
                            flyer_details.get("flyer_name")
                            .replace(" ", "_")
                            .replace("/", "_")
                        )
                        .encode()
                        .decode("unicode_escape")
                    )
                    f_merchant = (
                        (
                            flyer_details.get("flyer_merchant")
                            .replace(" ", "_")
                            .replace("/", "_")
                        )
                        .encode()
                        .decode("unicode_escape")
                    )
                    flyer_name = f"{f_name}_{f_merchant}_{f_valid_to}"
                    target_url = f"{self.base_url}/flyers/{f_id}/flyer_items"
                    resp_json = self.fetch_url_response_json(target_url)
                    flyer_dict[f_merchant] = {
                        "flyer_name": flyer_name,
                        "flyer_json": resp_json,
                    }
                    json_file_name = f"{flyer_name}.json"
                    save_name_path = self.data_folder_path / json_file_name
                    if save_name_path.exists():
                        print(f"{save_name_path} exists. Skipping write.")
                        continue
                    self.write_data_to_path(data=flyer_dict, f_name=save_name_path)

    # def select_store_flyers(self):
    # filtered_flyers = [store for store in self.stores if store in flyer]

    # TODO: Create a cleanup function for old flyers
    def cleanup_flyers():
        pass

    def fetch_url_response_json(self, url):
        """Get response json from target url"""

        response = requests.get(url)
        return response.json()

    def generate_items_dict(self, flyer):
        """given a flyer, retrieve all the flyer's items and the associated prices if available."""
        flyer_items = []
        for item in flyer:
            item_dict = {}
            name = item.get("name")
            name_decoded = (
                name.encode().decode("unicode_escape")
                if name
                else "No item name provided."
            )
            price = item.get("price")
            brand = item.get("brand")
            brand_decoded = (
                brand.encode().decode("unicode_escape")
                if brand
                else "No brand provided."
            )
            item_dict[name_decoded] = {"price": price, "brand": brand_decoded}
            flyer_items.append(item_dict)

        return flyer_items

    def get_price_dict(self, items):
        """Retrieve price and brand for a given store flyer that matches the items provided by user."""
        price_payload = {key: [] for key in items}
        all_flyers_in_data = [
            json_file.name
            for json_file in self.data_folder_path.iterdir()
            if json_file.is_file() and json_file.suffix == ".json"
        ]

        flyers_filtered_to_stores = []
        for store_flyer in all_flyers_in_data:
            for grocery_store in GROCERY_STORES:
                if grocery_store in store_flyer:
                    flyers_filtered_to_stores.append(store_flyer)

        for flyer in flyers_filtered_to_stores:
            flyer_path = self.data_folder_path / flyer
            with open(flyer_path) as f:
                flyer_items_data = json.load(f)
            store = list(flyer_items_data.keys())[0]
            for flyer_value in flyer_items_data.values():
                flyer_json = flyer_value.get("flyer_json")
                all_flyer_items = self.generate_items_dict(flyer_json)
                # Parse through list of objects (flyer items) within a store flyer
            for item in items:
                matching_items_array = []
                for g_items_dict in all_flyer_items:
                    for g_item_key, g_item_value in g_items_dict.items():
                        # Dealing with multiple g_items matching item
                        if item in g_item_key:
                            g_item_value["store"] = store
                            matching_items_array.append(g_item_value)
                price_payload[item].extend(matching_items_array)

        return price_payload

    def write_data_to_path(self, data, f_name):
        """Write data into a json file to destination"""
        with open(f_name, "w") as f:
            json.dump(data, f, indent=4)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Receive location data to pull flyer info for that area"
    )
    parser.add_argument(
        "--postal_code",
        type=str,
        help="Provide postal code reference. ",
        default="N2E1A1",
    )
    parser.add_argument(
        "--locale", type=str, help="Specify locale, eg. en", default="en"
    )
    args = parser.parse_args()

    scraper = Scraper(
        locale=args.locale, postal_code=args.postal_code, stores=GROCERY_STORES
    )
    rand_length = random.randint(9, 12)
    session = "".join(random.choices(string.digits, k=rand_length))
    all_flyers_path = Path("data/").resolve() / "all_flyers.json"
    target = scraper.construct_url(session)
    flyer_response = scraper.fetch_url_response_json(target)
    all_flyers = scraper.retrieve_flyer_infos_from_json(flyer_response)
    scraper.retrieve_all_grocery_flyers()
    scraper.get_price_dict(["Broccoli", "Cauliflower", "Mango", "Mushrooms", "Bread"])
