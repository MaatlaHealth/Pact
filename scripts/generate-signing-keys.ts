/**
 * Generates an Ed25519 key pair for signing Proof of Work Receipts and prints
 * the environment variables to set. The private key is printed once and is
 * never written to disk by this script.
 *
 * Usage: npm run keys:generate
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const keyId = `pact-ed25519-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

console.log("# Add these to your environment (base64 of the PEM, single line):");
console.log(`RECEIPT_SIGNING_KEY_ID=${keyId}`);
console.log(`RECEIPT_SIGNING_PRIVATE_KEY_PEM=${Buffer.from(privateKeyPem).toString("base64")}`);
console.log(`RECEIPT_SIGNING_PUBLIC_KEY_PEM=${Buffer.from(publicKeyPem).toString("base64")}`);
console.log("");
console.log("# Public key (PEM) for publishing:");
console.log(publicKeyPem);
