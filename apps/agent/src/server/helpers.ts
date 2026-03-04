import path from "path";
import { promises as fs } from "fs";
import dotenv from "dotenv";
import { drizzle, migrate, users, clients } from "@/server/database/sqlite";
import { hash } from "@node-rs/argon2";
import type { UserCredentials } from "@/shared/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function ask(
  question: string,
  opts?: { required?: boolean },
): Promise<string> {
  return new Promise<string>((resolve) => {
    process.stdout.write(question);
    process.stdin.once("data", (data) => resolve(data.toString().trim()));
  }).then((r) => {
    if (opts?.required && !r) return ask(question, opts);
    return r;
  });
}

export async function createFileWithContent(filePath: string, content: string) {
  try {
    const f = await fs.open(filePath, "wx");
    await f.writeFile(content, { encoding: "utf8" });
    await f.close();
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      console.error(`File ${path.basename(filePath)} already exists.`);
    } else {
      console.error(`Error creating ${path.basename(filePath)} file: `, error);
    }
  }
}

export async function writeFileWithContent(filePath: string, content: string) {
  await fs.writeFile(filePath, content, { encoding: "utf8" });
}

export function configEnv() {
  dotenv.config();
  if (process.argv.includes("--dev")) {
    dotenv.config({
      path: path.resolve(process.cwd(), ".env.development.local"),
      override: true,
    });
    process.env = { ...process.env, NODE_ENV: "development" };
  }
}

export function configDatabase() {
  const db = drizzle(process.env.DATABASE_URL);
  migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "./drizzle/sqlite"),
  });
  db.insert(clients)
    .values({
      client_id: "swagger-client",
      client_info: JSON.stringify({
        redirect_uris: ["http://localhost:9200/swagger/oauth2-redirect.html"],
        client_name: "Swagger Client",
        client_uri: "http://localhost:9200/swagger",
        scope: "mcp llm scope123 blob",
        client_secret: "swagger-secret",
        client_secret_expires_at:
          Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        client_id: "swagger-client",
        client_id_issued_at: Date.now(),
      }),
    })
    .onConflictDoNothing()
    .then(() => null);
  return db;
}

export async function createUser(
  db: ReturnType<typeof configDatabase>,
  { email, password }: UserCredentials,
  scope: string[],
  info?: {
    firstName?: string;
    lastName?: string;
  },
) {
  email = await z
    .string()
    .email()
    .parseAsync(email)
    .catch(() => {
      throw new Error(`Invalid email address: ${email}`);
    });

  await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .then((r) => {
      if (r.length > 0) {
        throw new Error(`User with email ${email} already exists.`);
      }
    });

  const hashedPassword = await hash(password);
  await db.insert(users).values({
    email,
    password: hashedPassword,
    scope: scope.join(" "),
    ...info,
  });

  return db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .then((r) => r[0])
    .then((u) => {
      if (u) return u;
      throw new Error(
        `FATAL: User with email ${email} not found. (not created)`,
      );
    });
}
