import axios from "axios";

const BASE_API_URL = "http://localhost:3001";

export const handleFormPost = (data) => {
  const endpoint = "save-form";
  const url = `${BASE_API_URL}/${endpoint}`;

  axios.post(url, data);
};

export const handlePriceCheck = (
  locale: string,
  postalCode: string,
  items: []
) => {
  const endpoint = "get-prices";
  const url = `${BASE_API_URL}/${endpoint}?locale=${locale}&postal_code=${postalCode}&list-items=${items}`;

  const response = axios.get(url);
  return response;
};
