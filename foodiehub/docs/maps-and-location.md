# Maps and delivery location

## Existing map support

Branches already store optional latitude and longitude. Customer delivery addresses now store optional coordinates as well. OpenStreetMap provides the address-pin preview and map links without an application API key. Driver and customer navigation links use coordinates when live sharing is available and otherwise use saved addresses.

## Address search and geocoding

The server exposes authenticated customer search and reverse-geocoding endpoints at `/api/v1/customer/geocoding/search` and `/api/v1/customer/geocoding/reverse`. Configure a Nominatim-compatible provider before using address search. The service normalizes `lat`, `lon`, `display_name`, and `address` fields from search/reverse responses.

Set these server environment variables:

- `MAP_GEOCODER_BASE_URL`: HTTPS base URL for the provider. It must expose `/search` and `/reverse` endpoints.
- `MAP_GEOCODER_API_KEY`: optional bearer token when the selected provider requires authentication.
- `MAP_GEOCODER_USER_AGENT`: optional identifying user agent. Set a project contact value when required by the provider.

No geocoder URL or key is currently configured, so the UI reports address search as unavailable while manual coordinates and browser location selection remain usable.

## Live driver location

Restaurant owners or authorized delivery managers can enable location sharing globally or for an individual branch in Delivery Orders. A delivery employee must also grant browser location permission and start sharing. Updates are validated by the server, are scoped to the employee's active assignments, and expire after two minutes. Completion, failure, rejection, cancellation, reassignment, or disabling sharing removes the stored point. Customers can only read a point for their own active order; restaurant staff can read it through the branch-scoped delivery order detail endpoint.

Browser location access requires a secure context (HTTPS, or localhost during development). The restaurant Live Delivery Map uses OpenStreetMap tiles and sends the selected map center coordinates to OpenStreetMap when the map is loaded; the iframe suppresses the referring page URL. No map coordinates, routes, or ETAs are synthesized. ETA remains unavailable because no routing service is configured.
