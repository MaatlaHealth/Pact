import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, passwordPolicyProblems, verifyPassword } from "@/lib/security/password";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { HttpError } from "@/lib/security/request";
import { recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email/service";
import { createOrganization } from "@/lib/orgs/service";
import { createSession, revokeAllSessions } from "@/lib/auth/session";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
  organizationName?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function registerUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  const problems = passwordPolicyProblems(input.password);
  if (problems.length) throw new HttpError(422, problems.join(" "), "weak_password", { problems });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "An account with that email already exists.", "email_taken");

  const passwordHash = await hashPassword(input.password);
  const user = await db.user.create({ data: { email, name: input.name.trim(), passwordHash } });
  await recordAudit({ actorType: "USER", actorId: user.id, actorLabel: user.name, action: "user.registered", entityType: "user", entityId: user.id, title: "Account created", ipAddress: input.ipAddress });

  if (input.organizationName?.trim()) {
    await createOrganization({ name: input.organizationName.trim(), ownerId: user.id });
  }

  await issueEmailVerification(user.id, email, user.name);
  await createSession(user.id, { ipAddress: input.ipAddress, userAgent: input.userAgent });
  return user;
}

export async function issueEmailVerification(userId: string, email: string, name: string) {
  const token = generateToken(32);
  await db.emailVerificationToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await db.emailVerificationToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) } });
  const link = `${env().APP_URL}/verify-email?token=${token}`;
  return sendEmail({
    to: email,
    subject: "Verify your PACT Protocol email",
    heading: `Welcome, ${name}`,
    paragraphs: [
      "Confirm this email address to activate your PACT Protocol account.",
      "The link is valid for 24 hours.",
    ],
    action: { label: "Verify email", url: link },
    kind: "verification",
  });
}

export async function verifyEmailToken(token: string) {
  const record = await db.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError(400, "This verification link is invalid or has expired.", "invalid_token");
  }
  await db.$transaction([
    db.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() } }),
  ]);
  await recordAudit({ actorType: "USER", actorId: record.userId, actorLabel: record.user.name, action: "user.email_verified", entityType: "user", entityId: record.userId, title: "Email verified" });
  return record.user;
}

export async function loginUser(input: { email: string; password: string; ipAddress?: string | null; userAgent?: string | null }) {
  const email = input.email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  // Always run the hash comparison so timing does not reveal whether the email exists.
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : await verifyPassword(input.password, DUMMY_HASH);
  if (!user || !valid) {
    await recordAudit({ actorType: "SYSTEM", action: "auth.login_failed", title: "Failed sign-in attempt", severity: "WARNING", metadata: { email }, ipAddress: input.ipAddress });
    throw new HttpError(401, "Incorrect email or password.", "invalid_credentials");
  }
  await createSession(user.id, { ipAddress: input.ipAddress, userAgent: input.userAgent });
  await recordAudit({ actorType: "USER", actorId: user.id, actorLabel: user.name, action: "auth.login", entityType: "user", entityId: user.id, title: "Signed in", ipAddress: input.ipAddress });
  return user;
}

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return; // Do not reveal whether the account exists.
  const token = generateToken(32);
  await db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  const link = `${env().APP_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Reset your PACT Protocol password",
    heading: "Password reset requested",
    paragraphs: ["Use the link below to choose a new password. It expires in one hour.", "If you did not request this, you can ignore this message."],
    action: { label: "Reset password", url: link },
    kind: "password_reset",
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const problems = passwordPolicyProblems(newPassword);
  if (problems.length) throw new HttpError(422, problems.join(" "), "weak_password", { problems });
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new HttpError(400, "This reset link is invalid or has expired.", "invalid_token");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
  ]);
  await revokeAllSessions(record.userId);
  await recordAudit({ actorType: "USER", actorId: record.userId, action: "auth.password_reset", entityType: "user", entityId: record.userId, title: "Password reset", severity: "NOTICE" });
}

// A valid scrypt hash of a random string, used to equalise timing for unknown emails.
const DUMMY_HASH =
  "scrypt$131072$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
