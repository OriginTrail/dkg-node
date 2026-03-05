import { expect } from "chai";
import os from "os";
import path from "path";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";

import {
  resolvePublisherConfigFromAgentEnv,
  upsertAgentEnvValues,
} from "../../src/server/setupPublisher";

describe("setupPublisher helpers", () => {
  it("resolves publisher config from consolidated agent env values", () => {
    const resolved = resolvePublisherConfigFromAgentEnv(
      {
        DKGP_DATABASE_URL:
          "mysql://root:my%21pass@localhost:3306/dkg_publisher_db",
        REDIS_URL: "redis://:redis%23secret@localhost:6379",
        WORKER_COUNT: "3",
        POLL_FREQUENCY: "1500",
        STORAGE_PATH: "./publisher-data",
        STORAGE_BASE_URL: "http://localhost:9200/storage",
      },
      "http://localhost:9200",
    );

    expect(resolved).to.not.equal(null);
    expect(resolved!.mysql.user).to.equal("root");
    expect(resolved!.mysql.password).to.equal("my!pass");
    expect(resolved!.mysql.database).to.equal("dkg_publisher_db");
    expect(resolved!.redis.password).to.equal("redis#secret");
    expect(resolved!.workerCount).to.equal(3);
    expect(resolved!.pollFrequency).to.equal(1500);
    expect(resolved!.storagePath).to.equal("./publisher-data");
  });

  it("resolves redis settings from host/port/password when REDIS_URL is missing", () => {
    const resolved = resolvePublisherConfigFromAgentEnv(
      {
        DKGP_DATABASE_URL:
          "mysql://root:password@localhost:3306/dkg_publisher_db",
        REDIS_HOST: "redis.internal",
        REDIS_PORT: "6380",
        REDIS_PASSWORD: "redis#secret",
      },
      "http://localhost:9200",
    );

    expect(resolved).to.not.equal(null);
    expect(resolved!.redisUrl).to.equal(
      "redis://:redis%23secret@redis.internal:6380",
    );
    expect(resolved!.redis.host).to.equal("redis.internal");
    expect(resolved!.redis.port).to.equal(6380);
    expect(resolved!.redis.password).to.equal("redis#secret");
  });

  it("recovers from legacy REDIS_URL format without protocol", () => {
    const resolved = resolvePublisherConfigFromAgentEnv(
      {
        DKGP_DATABASE_URL:
          "mysql://root:password@localhost:3306/dkg_publisher_db",
        REDIS_URL: "localhost:6379",
      },
      "http://localhost:9200",
    );

    expect(resolved).to.not.equal(null);
    expect(resolved!.redisUrl).to.equal("redis://localhost:6379");
    expect(resolved!.redis.host).to.equal("localhost");
    expect(resolved!.redis.port).to.equal(6379);
  });

  it("updates existing keys and appends missing keys when writing agent env", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dkg-agent-env-"));
    const envPath = path.join(tempDir, ".env");

    try {
      await writeFile(
        envPath,
        [
          'ASYNC_PUBLISHING_ENABLED="false"',
          'DKG_BLOCKCHAIN="otp:20430"',
        ].join("\n"),
        "utf8",
      );

      await upsertAgentEnvValues(
        {
          ASYNC_PUBLISHING_ENABLED: true,
          DKGP_DATABASE_URL: "mysql://root:password@localhost:3306/dkg_publisher_db",
        },
        envPath,
      );

      const updated = await readFile(envPath, "utf8");
      expect(updated).to.contain("ASYNC_PUBLISHING_ENABLED=true");
      expect(updated).to.contain('DKG_BLOCKCHAIN="otp:20430"');
      expect(updated).to.contain(
        'DKGP_DATABASE_URL="mysql://root:password@localhost:3306/dkg_publisher_db"',
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("removes keys and collapses duplicate entries when writing agent env", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "dkg-agent-env-"));
    const envPath = path.join(tempDir, ".env");

    try {
      await writeFile(
        envPath,
        [
          'POLL_FREQUENCY="5000"',
          'POLL_FREQUENCY="9000"',
          'ASYNC_PUBLISHING_ENABLED="false"',
        ].join("\n"),
        "utf8",
      );

      await upsertAgentEnvValues(
        {
          ASYNC_PUBLISHING_ENABLED: true,
          POLL_FREQUENCY: null,
        },
        envPath,
      );

      const updated = await readFile(envPath, "utf8");
      const asyncMatches = updated.match(/^ASYNC_PUBLISHING_ENABLED=/gm) || [];
      const pollMatches = updated.match(/^POLL_FREQUENCY=/gm) || [];

      expect(asyncMatches.length).to.equal(1);
      expect(updated).to.contain("ASYNC_PUBLISHING_ENABLED=true");
      expect(pollMatches.length).to.equal(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
