/** The redirect URI's page (a server component around the client-side callback). */
import { Finish } from "./finish";

export default function Callback() {
  return (
    <main>
      <h1>Signing in</h1>
      <Finish />
    </main>
  );
}
