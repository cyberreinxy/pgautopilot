import { ApiClient } from "./client.js";

export function createApiClient(baseUrl: string, token?: string): ApiClient {
  return new ApiClient({ baseUrl, token });
}
