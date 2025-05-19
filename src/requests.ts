import axios from "axios";

const BASE_API_URL = "http://localhost:3001";

// export const handleFormPost = (data) => {
//   const endpoint = "save-form";
//   const url = `${BASE_API_URL}/${endpoint}`;

//   axios.post(url, data);
// };
/**
 *
 * @param locale language string value eg. "en"
 * @param postalCode use postal code eg. "A1A 1A1"
 * @param items list of items from grocery list
 * @returns data key in axios response body with payload format [{item: {price: string, name: string, store: string}}]
 */
export const handlePriceCheck = (
  locale: string,
  postalCode: string,
  items: []
) => {
  const endpoint = "get-prices";
  const url = `${BASE_API_URL}/${endpoint}`;

  const response = axios.get(url, {
    params: {
      locale: locale,
      postal_code: postalCode,
      "list-items": items.join(","),
    },
  });
  return response;
};
