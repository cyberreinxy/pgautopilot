import { Providers } from "../app/providers";
import { Layout } from "../components/Layout";

export function RootLayout() {
  return (
    <Providers>
      <Layout />
    </Providers>
  );
}
