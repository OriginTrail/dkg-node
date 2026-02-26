import DKG from "dkg.js";
import { WalletService } from "./WalletService";

export interface SparqlQueryResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface DkgGetResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class DkgService {
  private dkgEndpoint: string;
  private dkgBlockchain: string;
  private queryClient: any | null = null;
  private walletService: WalletService;

  constructor(walletService: WalletService) {
    this.dkgEndpoint = process.env.DKG_ENDPOINT || "http://localhost:8900";
    this.dkgBlockchain = process.env.DKG_BLOCKCHAIN || "hardhat1:31337";
    this.walletService = walletService;
    this.initializeQueryClient();
  }

  /**
   * Initialize a reusable DKG client for queries and reads
   */
  private async initializeQueryClient(): Promise<void> {
    try {
      // Get any active wallet without locking it (for read-only operations)
      const wallet = await this.walletService.getWalletForQueries();
      if (!wallet) {
        console.warn("⚠️ No wallet available for query client initialization");
        return;
      }

      const endpointUrl = new URL(this.dkgEndpoint);

      console.log(`🔧 Initializing reusable DKG Query Client with wallet:`, {
        walletId: wallet.id,
        address: wallet.address,
        endpoint: this.dkgEndpoint,
        blockchain: this.dkgBlockchain,
      });

      this.queryClient = new DKG({
        endpoint: `${endpointUrl.protocol}//${endpointUrl.hostname}`,
        port: endpointUrl.port,
        blockchain: {
          name: this.dkgBlockchain,
          publicKey: wallet.address,
          privateKey: wallet.privateKey,
        },
        maxNumberOfRetries: 100,
        frequency: 2,
        contentType: "all",
      });

      console.log(`✅ Reusable DKG Query client initialized successfully`);
    } catch (error) {
      console.error("❌ Failed to initialize query client:", error);
    }
  }

  /**
   * Execute SPARQL query on DKG network
   */
  async executeSparqlQuery(
    query: string,
    queryType: string = "SELECT",
  ): Promise<SparqlQueryResult> {
    try {
      // Use the reusable query client or create one if needed
      if (!this.queryClient) {
        await this.initializeQueryClient();
        if (!this.queryClient) {
          throw new Error("Failed to initialize DKG query client");
        }
      }

      const dkgClient = this.queryClient;

      console.log(`🔍 Executing SPARQL query:`, {
        query: query.substring(0, 200) + (query.length > 200 ? "..." : ""),
        queryType,
        endpoint: this.dkgEndpoint,
      });

      const queryResult = await dkgClient.graph.query(query, queryType);

      console.log(`✅ SPARQL query executed successfully`);

      return {
        success: true,
        data: queryResult.data,
      };
    } catch (error: any) {
      console.error(`❌ SPARQL query failed:`, error);

      return {
        success: false,
        error:
          error.message ||
          "Unknown error occurred while executing SPARQL query",
      };
    }
  }

  /**
   * Get asset from DKG by UAL
   */
  async getAsset(ual: string, options: any = {}): Promise<DkgGetResult> {
    try {
      // Use the reusable query client or create one if needed
      if (!this.queryClient) {
        await this.initializeQueryClient();
        if (!this.queryClient) {
          throw new Error("Failed to initialize DKG query client");
        }
      }

      const dkgClient = this.queryClient;

      console.log(`🔍 Getting asset from DKG:`, {
        ual,
        options,
        endpoint: this.dkgEndpoint,
      });

      const assetResult = await dkgClient.asset.get(ual, {
        contentType: options.contentType || "all",
        includeMetadata: options.includeMetadata || false,
        ...options,
      });

      console.log(`✅ Asset retrieved successfully`);

      return {
        success: true,
        data: assetResult,
      };
    } catch (error: any) {
      console.error(`❌ Asset retrieval failed:`, error);

      return {
        success: false,
        error: error.message || "Unknown error occurred while retrieving asset",
      };
    }
  }

  /**
   * Create DKG client for wallet-based operations (publishing)
   */
  createWalletDKGClient(wallet: any): any {
    console.log(`🔄 Creating DKG client for wallet:`, {
      id: wallet.id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      hasPrivateKey: !!wallet.privateKey,
    });

    const privateKey = wallet.privateKey;

    if (!privateKey) {
      throw new Error(`No private key found for wallet ${wallet.address}`);
    }

    const endpointUrl = new URL(this.dkgEndpoint);

    console.log(`🔧 DKG Client Configuration:`, {
      endpoint: `${endpointUrl.protocol}//${endpointUrl.hostname}`,
      port: endpointUrl.port,
      blockchain: this.dkgBlockchain,
      fullUrl: this.dkgEndpoint,
    });

    const walletDkgClient = new DKG({
      endpoint: `${endpointUrl.protocol}//${endpointUrl.hostname}`,
      port: endpointUrl.port,
      blockchain: {
        name: this.dkgBlockchain,
        publicKey: wallet.address,
        privateKey: privateKey,
      },
      maxNumberOfRetries: 600,
      frequency: 2,
      contentType: "all",
    });

    console.log(`✅ Wallet DKG client created successfully`);
    return walletDkgClient;
  }

  /**
   * Validate SPARQL query syntax (basic validation)
   */
  validateSparqlQuery(query: string): { valid: boolean; error?: string } {
    try {
      const normalizedQuery = query.trim().toUpperCase();

      if (!normalizedQuery) {
        return { valid: false, error: "Query cannot be empty" };
      }

      // Check for common SPARQL query types
      const validQueryTypes = ["SELECT", "CONSTRUCT", "ASK", "DESCRIBE"];
      const startsWithValidType = validQueryTypes.some((type) =>
        normalizedQuery.startsWith(type),
      );

      if (!startsWithValidType) {
        return {
          valid: false,
          error: `Query must start with one of: ${validQueryTypes.join(", ")}`,
        };
      }

      // Check for WHERE clause (required for most queries)
      if (
        normalizedQuery.startsWith("SELECT") ||
        normalizedQuery.startsWith("CONSTRUCT")
      ) {
        if (!normalizedQuery.includes("WHERE")) {
          return {
            valid: false,
            error: "SELECT and CONSTRUCT queries must include a WHERE clause",
          };
        }
      }

      // Check for balanced braces
      const openBraces = (query.match(/\{/g) || []).length;
      const closeBraces = (query.match(/\}/g) || []).length;

      if (openBraces !== closeBraces) {
        return {
          valid: false,
          error: "Unbalanced braces in query",
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: `Query validation error: ${error.message}`,
      };
    }
  }

  /**
   * Get example queries for different use cases
   */
  getExampleQueries(): Record<string, string> {
    return {
      "Find all audits": `
        PREFIX scan: <https://tracelabs.io/scan-ontology.json#>
        
        SELECT ?audit ?factoryName ?country
        WHERE {
          ?audit a scan:Audit .
          ?audit scan:factoryName ?factoryName .
          ?audit scan:factoryCountry ?country .
        }
        LIMIT 10
      `,

      "Find audit versions by factory": `
        PREFIX scan: <https://tracelabs.io/scan-ontology.json#>
        
        SELECT ?version ?auditName ?score ?date
        WHERE {
          ?audit a scan:Audit .
          ?audit scan:factoryName "FACTORY_NAME_HERE" .
          ?version scan:isVersionOf ?audit .
          ?version scan:auditName ?auditName .
          ?version scan:overallComplianceScore ?score .
          ?version scan:auditDate ?date .
        }
        ORDER BY DESC(?date)
      `,

      "Find high-risk audits": `
        PREFIX scan: <https://tracelabs.io/scan-ontology.json#>
        
        SELECT ?version ?factoryName ?score ?riskIndex
        WHERE {
          ?audit a scan:Audit .
          ?audit scan:factoryName ?factoryName .
          ?version scan:isVersionOf ?audit .
          ?version scan:overallComplianceScore ?score .
          ?version scan:riskIndex ?riskIndex .
          FILTER(?score < 70)
        }
        ORDER BY ?score
      `,

      "Count audits by country": `
        PREFIX scan: <https://tracelabs.io/scan-ontology.json#>
        
        SELECT ?country (COUNT(?audit) as ?auditCount)
        WHERE {
          ?audit a scan:Audit .
          ?audit scan:factoryCountry ?country .
        }
        GROUP BY ?country
        ORDER BY DESC(?auditCount)
      `,
    };
  }

  /**
   * Get node info from DKG network
   */
  async getNodeInfo(): Promise<DkgGetResult> {
    try {
      const dkgClient = this.createQueryDKGClient();
      const nodeInfo = await dkgClient.node.info();

      return {
        success: true,
        data: nodeInfo,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
