#!/usr/bin/env python3
import argparse
import json
import string
import requests
import random
from pathlib import Path

GROCERY_STORES = [
    "Sobeys",
    "Costco",
    "Longos",
    "Farm Boy",
    "Food Basics",
    "FreshCo",
    "Central Fresh Market",
    "T&T Supermarket",
    "Save A Lot Grocery Outlet",
]

BASE_URL = ""


class Scraper:
    def __init__(self, locale, postal_code, stores=[]) -> None:
        self.locale = locale
        self.postal_code = postal_code
        self.base_url = BASE_URL
        self.stores = stores
        self.refresh_dt = ""
        self.all_flyers = []
        self.data_folder_path = Path("../data/").resolve()
        self.data_folder_path.mkdir(exist_ok=True)

    def construct_url(self, session):

        full_url = f"{self.base_url}/data?locale={self.locale}&postal_code={self.postal_code}&sid={session}"
        return full_url

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
            current_flyer[merchant] = {
                "flyer_id": current_flyer_id,
                "valid_from": valid_from,
                "valid_to": flyer_expiry,
                "merchant_id": merchant_id,
                "flyer_name": flyer_name,
            }
            all_flyers.append(current_flyer)

        self.all_flyers = all_flyers
        save_folder_path = self.data_folder_path / "all_flyers.json"
        self.write_data_to_path(
            all_flyers,
            save_folder_path,
        )
        return all_flyers

    def retrieve_all_store_flyers(self):
        """Constructs url to retrieve flyer items for each store.
        Write store's flyer to json."""
        flyer_objects = self.all_flyers
        # store_flyers = []

        # save path should be unique enough so that it covers the time period
        # of the flyer.
        for flyer in flyer_objects:
            flyer_dict = {}
            f_id = flyer.get("id")
            f_name = flyer.get("name").replace(" ", "_")
            f_merchant = flyer.get("merchant")
            target_url = f"{self.base_url}/flyers/{f_id}/flyer_items"
            resp_json = self.fetch_url_response_json(target_url)
            flyer_dict[f_merchant] = {"flyer_name": f_name, "flyer_json": resp_json}

            json_file_name = f"{f_name}.json"
            save_name_path = (
                self.data_folder_path / f"{f_merchant}_{f_name}" / json_file_name
            )
            self.write_data_to_path(flyer_dict, save_name_path)
            # store_flyers.append(flyer_dict)

    # def select_store_flyers(self):
    # filtered_flyers = [store for store in self.stores if store in flyer]

    # TODO: Create a cleanup function for old flyers
    def cleanup_flyers():
        pass

    def fetch_url_response_json(self, url):
        """Get response json from target url"""
        target_url = url
        response = requests.get(target_url)
        return response.json()

    def generate_item_dict(self, flyer):
        """given a flyer, retrieve all the flyer's items and the associated prices if available."""
        flyer_items = []
        for item in flyer:
            item_dict = {}
            name = item.get("name")
            price = item.get("price")
            brand = item.get("brand")
            item_dict[name] = {"price": price, "brand": brand}
            flyer_items.append(item_dict)

        return flyer_items

    def write_data_to_path(data, f_name, command="w"):
        with open(f_name, command) as f:
            json.dumps(data)


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
    rand_length = random.randint(8, 16)
    session = "".join(random.choices(string.digits, k=rand_length))
    target = scraper.construct_url(session)
    flyer_response = scraper.fetch_url_response_json(target)
    all_flyers = scraper.retrieve_flyer_infos_from_json(flyer_response)
    print(all_flyers)
    # item_data = scraper.get_item_price_info(flyer_response)
