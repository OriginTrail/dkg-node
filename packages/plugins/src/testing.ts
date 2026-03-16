import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createBlobStorage, express } from "./helpers";
import { BlobData, BlobMetadata } from "./types";

export const createInMemoryBlobStorage = () => {
  const blobStorage = new Map<
    string,
    { data: BlobData; metadata: BlobMetadata }
  >();

  return createBlobStorage({
    put: async (id, data, metadata) => {
      blobStorage.set(id, { data, metadata: metadata as any });
    },
    delete: async (id) => {
      blobStorage.delete(id);
    },
    get: async (id) => {
      return blobStorage.get(id)?.data || null;
    },
    info: async (id) => {
      return blobStorage.get(id)?.metadata || null;
    },
  });
};

export const createExpressApp = () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  return app;
};

export const createMcpServerClientPair = async () => {
  const server = new McpServer({ name: "Test DKG Server", version: "1.0.0" });
  const client = new Client({ name: "Test DKG Client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  let authInfoForClientMessages: AuthInfo | undefined;

  const originalClientSend = clientTransport.send.bind(clientTransport);
  clientTransport.send = (message, options) => {
    return originalClientSend(message, {
      ...options,
      authInfo: options?.authInfo ?? authInfoForClientMessages,
    });
  };

  return {
    server,
    client,
    clientTransport,
    serverTransport,
    setClientAuthInfo: (authInfo?: AuthInfo) => {
      authInfoForClientMessages = authInfo;
    },
    connect: () =>
      Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]),
  };
};

export const createMockDkgClient = () => ({
  // Mock DKG instance with all required properties
  get: () => Promise.resolve({}),
  query: () => Promise.resolve([]),
  assertion: {
    get: () => Promise.resolve({}),
    create: () => Promise.resolve({}),
  },
  asset: {
    get: () => Promise.resolve({}),
    create: () => Promise.resolve({}),
  },
  blockchain: {
    get: () => Promise.resolve({}),
  },
  node: {
    get: () => Promise.resolve({}),
  },
  graph: {
    query: () => Promise.resolve([]),
  },
  network: {
    get: () => Promise.resolve({}),
  },
  storage: {
    get: () => Promise.resolve({}),
  },
  paranet: {
    get: () => Promise.resolve({}),
  },
});
