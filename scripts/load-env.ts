// Side-effect import for tsx scripts (migrate / seed / stress): loads .env.local
// then .env into process.env BEFORE any DB code runs. Import this FIRST:
//   import "./load-env";
// dotenv does not override already-set process.env vars, so .env.local wins.
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
