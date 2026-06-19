#!/usr/bin/env node
/**
 * Generates cryptographically strong values for JWT_SECRET and INTERNAL_SERVICE_SECRET.
 * Run: npm run secrets:generate
 */
import { randomBytes } from "node:crypto";

function generateSecret(byteLength = 48) {
  return randomBytes(byteLength).toString("base64url");
}

const jwt = generateSecret();
const internal = generateSecret();

console.log("");
console.log("Copy these into GitHub → Settings → Secrets and variables → Actions");
console.log("(and into .env for local development):\n");
console.log(`JWT_SECRET=${jwt}`);
console.log(`INTERNAL_SERVICE_SECRET=${internal}`);
console.log("");
