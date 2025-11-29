import pkg from "../package.json" with { type: "json" };

export const config = {
  version: pkg.version,
  environment: process.env.NODE_ENV,
};
