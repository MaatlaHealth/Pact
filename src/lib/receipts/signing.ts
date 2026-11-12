import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Ed25519 signing for Proof of Work Receipts. The private key never leaves
 * the server. The public key is published so anyone holding a receipt can
 * check its integrity offline.
 */

export interface SigningKeyPair {
  keyId: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyPem: string;
}

export function generateSigningKeyPair(keyId?: string): { keyId: string; privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const id = keyId ?? `pact-ed25519-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  return { keyId: id, privateKeyPem, publicKeyPem };
}

export class SigningNotConfiguredError extends Error {
  constructor() {
    super("Receipt signing is not configured. Run `npm run keys:generate` and set RECEIPT_SIGNING_KEY_ID, RECEIPT_SIGNING_PRIVATE_KEY_PEM, and RECEIPT_SIGNING_PUBLIC_KEY_PEM.");
    this.name = "SigningNotConfiguredError";
  }
}

let cachedPair: SigningKeyPair | undefined;

function decodePem(value: string): string {
  // Allow the PEM to be supplied base64-encoded on one line, which is easier for hosting dashboards.
  if (value.includes("-----BEGIN")) return value.replace(/\\n/g, "\n");
  return Buffer.from(value, "base64").toString("utf8");
}

export function loadSigningKeyPair(): SigningKeyPair {
  if (cachedPair) return cachedPair;
  const e = env();
  if (!e.RECEIPT_SIGNING_KEY_ID || !e.RECEIPT_SIGNING_PRIVATE_KEY_PEM || !e.RECEIPT_SIGNING_PUBLIC_KEY_PEM) throw new SigningNotConfiguredError();
  const privateKey = createPrivateKey(decodePem(e.RECEIPT_SIGNING_PRIVATE_KEY_PEM));
  const publicKeyPem = decodePem(e.RECEIPT_SIGNING_PUBLIC_KEY_PEM);
  const publicKey = createPublicKey(publicKeyPem);
  cachedPair = { keyId: e.RECEIPT_SIGNING_KEY_ID, privateKey, publicKey, publicKeyPem };
  return cachedPair;
}

export function signingConfigured(): boolean {
  try {
    loadSigningKeyPair();
    return true;
  } catch {
    return false;
  }
}

/** Signs the canonical payload bytes. Returns base64url. */
export function signBytes(pair: SigningKeyPair, bytes: Buffer): string {
  return sign(null, bytes, pair.privateKey).toString("base64url");
}

export function verifyBytes(publicKeyPem: string, bytes: Buffer, signatureB64Url: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return verify(null, bytes, key, Buffer.from(signatureB64Url, "base64url"));
  } catch {
    return false;
  }
}
