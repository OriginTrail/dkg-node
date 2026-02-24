/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable turbo/no-undeclared-env-vars */

import { describe, it, beforeEach, afterEach } from "mocha";
import { expect } from "chai";
import sinon from "sinon";
import request from "supertest";
import pluginEpcisPlugin from "../dist/index.js";
import { EpcisQueryService } from "../src/services/epcisQueryService";
import bicycleStory from "../test-data/bicycle-manufacturing-story.json";
import {
  ASSEMBLY_EVENTS,
  BICYCLE_TRACE_EVENTS,
  FRAME_TRACE_EVENTS,
  QUALITY_LAB_EVENTS,
  RECEIVING_EVENTS,
  jsonResponse,
  makeDkgQueryResult,
  publisherQueuedResponse,
  publisherStatusResponse,
} from "./fixtures/bicycleStoryFixtures";
import {
  createExpressApp,
  createInMemoryBlobStorage,
  createMcpServerClientPair,
  createMockDkgClient,
} from "@dkg/plugins/testing";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import express from "express";

const story = bicycleStory as any;
const event1 = story.events[0].request;
const event2 = story.events[1].request;
const event6 = story.events[5].request;
const event8 = story.events[7].request;
const frameEpc = story.characters.components.frame as string;
const bicycleEpc = story.characters.finishedProduct.bicycle as string;
const qualityLab = story.locations.qualityLab as string;

function parseToolResult(result: any): Record<string, any> {
  return JSON.parse((result.content as any[])[0].text);
}

function expectResponseErrorMessage(
  responseBody: Record<string, any>,
  messageFragment: string,
): void {
  expect(responseBody.error).to.be.a("string");
  expect(responseBody.error).to.include(messageFragment);
}

describe("@dkg/plugin-epcis checks", function () {
  let mockMcpServer: McpServer;
  let mockMcpClient: Client;
  let apiRouter: express.Router;
  let app: express.Application;
  let dkgContext: any;
  let dkgQueryStub: sinon.SinonStub;
  let fetchStub: sinon.SinonStub;
  let originalMcpUrl: string | undefined;

  this.timeout(5000);

  beforeEach(async () => {
    originalMcpUrl = process.env.EXPO_PUBLIC_MCP_URL;
    process.env.EXPO_PUBLIC_MCP_URL = "http://test-publisher:9999";
    fetchStub = sinon.stub(global, "fetch");

    dkgContext = {
      dkg: createMockDkgClient(),
      blob: createInMemoryBlobStorage(),
    };
    dkgQueryStub = sinon.stub(dkgContext.dkg.graph, "query");

    const { server, client, connect } = await createMcpServerClientPair();
    mockMcpServer = server;
    mockMcpClient = client;
    apiRouter = express.Router();
    app = createExpressApp();

    pluginEpcisPlugin(dkgContext, mockMcpServer, apiRouter);
    await connect();
    app.use("/", apiRouter);
  });

  afterEach(() => {
    sinon.restore();
    if (originalMcpUrl !== undefined) {
      process.env.EXPO_PUBLIC_MCP_URL = originalMcpUrl;
    } else {
      delete process.env.EXPO_PUBLIC_MCP_URL;
    }
  });

  describe("Plugin Registration", () => {
    it("registers epcis MCP tools with expected schema fields", async () => {
      const tools = await mockMcpClient.listTools().then((t) => t.tools);
      const queryTool = tools.find((tool) => tool.name === "epcis-query");
      const trackTool = tools.find((tool) => tool.name === "epcis-track-item");

      expect(queryTool).to.not.equal(undefined);
      expect(trackTool).to.not.equal(undefined);
      expect((queryTool as any).inputSchema.properties).to.include.keys(
        "epc",
        "bizStep",
        "bizLocation",
        "limit",
        "offset",
      );
      expect((trackTool as any).inputSchema.properties).to.include.keys("epc");
    });
  });

  describe("Capture - POST /epcis/capture", () => {
    it("captures a valid ObjectEvent and returns 202", async () => {
      fetchStub.resolves(publisherQueuedResponse(101));
      const response = await request(app)
        .post("/epcis/capture")
        .send(event1)
        .expect(202);

      expect(response.body.captureID).to.equal("101");
      expect(response.body.requestId).to.match(/^epcis-/);
      expect(response.body.receivedAt).to.be.a("string");
      expect(response.body.eventCount).to.equal(1);
    });

    it("captures a multi-EPC ObjectEvent and keeps eventCount as 1", async () => {
      fetchStub.resolves(publisherQueuedResponse(102));
      const response = await request(app)
        .post("/epcis/capture")
        .send(event2)
        .expect(202);

      expect(response.body.captureID).to.equal("102");
      expect(response.body.eventCount).to.equal(1);
    });

    it("captures a valid TransformationEvent", async () => {
      fetchStub.resolves(publisherQueuedResponse(106));
      await request(app).post("/epcis/capture").send(event6).expect(202);
    });

    it("captures a valid AggregationEvent", async () => {
      fetchStub.resolves(publisherQueuedResponse(108));
      await request(app).post("/epcis/capture").send(event8).expect(202);
    });
  });

  describe("Capture Status - GET /epcis/capture/:captureID", () => {
    it("returns completed status with UAL", async () => {
      fetchStub.resolves(
        publisherStatusResponse(
          "completed",
          "did:dkg:otp:2043/0xabc/123",
          "2024-03-01T16:30:00.000Z",
        ),
      );
      const response = await request(app).get("/epcis/capture/123").expect(200);

      expect(response.body.status).to.equal("completed");
      expect(response.body.captureID).to.equal("123");
      expect(response.body.UAL).to.equal("did:dkg:otp:2043/0xabc/123");
    });

    it("returns 404 when publisher returns 404", async () => {
      fetchStub.resolves(jsonResponse({ error: "not found" }, 404));
      const response = await request(app).get("/epcis/capture/404").expect(404);

      expect(response.body.error).to.equal("Capture not found");
      expect(response.body.captureID).to.equal("404");
    });

    it("returns 504 on publisher timeout", async () => {
      fetchStub.rejects(new DOMException("Timed out", "TimeoutError"));
      const response = await request(app).get("/epcis/capture/888").expect(504);

      expect(response.body.error).to.equal("Publisher timeout");
      expect(response.body.captureID).to.equal("888");
    });
  });

  describe("Events Query - GET /epcis/events", () => {
    it("queries by bizStep=receiving and returns 3 events", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(RECEIVING_EVENTS));
      const response = await request(app)
        .get("/epcis/events")
        .query({ bizStep: "receiving" })
        .expect(200);

      expect(response.body.count).to.equal(3);
      expect(response.body.results).to.have.length(3);
      expect(dkgQueryStub.firstCall.args[0]).to.include("BizStep-receiving");
    });

    it("queries by quality lab bizLocation and returns 3 events", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(QUALITY_LAB_EVENTS));
      const response = await request(app)
        .get("/epcis/events")
        .query({ bizLocation: qualityLab })
        .expect(200);

      expect(response.body.count).to.equal(3);
      expect(response.body.results).to.have.length(3);
      expect(dkgQueryStub.calledOnce).to.equal(true);
      const sparql = dkgQueryStub.firstCall.args[0] as string;
      expect(sparql).to.include(`epcis:bizLocation "${qualityLab}"`);
    });

    it("queries full trace for frame EPC and returns receiving/inspecting/assembling", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(FRAME_TRACE_EVENTS));
      const response = await request(app)
        .get("/epcis/events")
        .query({ epc: frameEpc, fullTrace: "true" })
        .expect(200);

      const steps = response.body.results.map((row: any) => row.bizStep);
      expect(response.body.count).to.equal(3);
      expect(steps.some((step: string) => step.endsWith("BizStep-receiving"))).to
        .equal(true);
      expect(steps.some((step: string) => step.endsWith("BizStep-inspecting"))).to
        .equal(true);
      expect(steps.some((step: string) => step.endsWith("BizStep-assembling"))).to
        .equal(true);
    });

    it("queries full trace for bicycle EPC and returns 3 events", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(BICYCLE_TRACE_EVENTS));
      const response = await request(app)
        .get("/epcis/events")
        .query({ epc: bicycleEpc, fullTrace: "true" })
        .expect(200);

      expect(response.body.count).to.equal(3);
      expect(response.body.results).to.have.length(3);
      expect(dkgQueryStub.calledOnce).to.equal(true);
      const sparql = dkgQueryStub.firstCall.args[0] as string;
      expect(sparql).to.include("UNION");
      expect(sparql).to.include(`?event epcis:outputEPCList "${bicycleEpc}"`);
      expect(sparql).to.include(`?event epcis:childEPCs "${bicycleEpc}"`);
    });

    it("includes date range filters in generated SPARQL", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(RECEIVING_EVENTS));
      await request(app)
        .get("/epcis/events")
        .query({
          from: "2024-03-01T00:00:00Z",
          to: "2024-03-01T23:59:59Z",
        })
        .expect(200);

      const sparql = dkgQueryStub.firstCall.args[0] as string;
      expect(sparql).to.include('xsd:dateTime("2024-03-01T00:00:00Z")');
      expect(sparql).to.include('xsd:dateTime("2024-03-01T23:59:59Z")');
    });

    it("returns pagination based on limit and offset query params", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(RECEIVING_EVENTS));
      const response = await request(app)
        .get("/epcis/events")
        .query({ bizStep: "receiving", limit: "5", offset: "10" })
        .expect(200);

      expect(response.body.pagination).to.deep.equal({ limit: 5, offset: 10 });
    });
  });

  describe("MCP Tools", () => {
    it("epcis-query returns assembly event results", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(ASSEMBLY_EVENTS));
      const result = await mockMcpClient.callTool({
        name: "epcis-query",
        arguments: { bizStep: "assembling" },
      });

      const payload = parseToolResult(result);
      expect(result.isError).to.not.equal(true);
      expect(payload.count).to.equal(1);
      expect(payload.summary).to.include("Found 1 EPCIS event");
      expect(payload.events.data[0].bizStep).to.include("BizStep-assembling");
    });

    it("epcis-track-item returns journey timeline with numbered steps", async () => {
      dkgQueryStub.resolves(makeDkgQueryResult(BICYCLE_TRACE_EVENTS));
      const result = await mockMcpClient.callTool({
        name: "epcis-track-item",
        arguments: { epc: bicycleEpc },
      });

      const payload = parseToolResult(result);
      expect(payload.eventCount).to.equal(3);
      expect(payload.summary).to.include("Journey Timeline");
      expect(payload.summary).to.include("1.");
      expect(payload.summary).to.include("assembling");
      expect(payload.summary).to.include("inspecting");
      expect(payload.summary).to.include("packing");
      expect(dkgQueryStub.calledOnce).to.equal(true);
      const sparql = dkgQueryStub.firstCall.args[0] as string;
      expect(sparql).to.include("UNION");
      expect(sparql).to.include(`?event epcis:inputEPCList "${bicycleEpc}"`);
    });
  });

  describe("Error Handling", () => {
    it("returns 400 when EPCISDocument fails schema validation", async () => {
      const response = await request(app)
        .post("/epcis/capture")
        .send({ epcisDocument: { type: "NotAnEPCIS" } })
        .expect(400);

      expect(response.body.error).to.equal("Invalid EPCISDocument");
    });

    it("returns 400 when EPCISDocument has no events", async () => {
      const emptyEventDoc = structuredClone(event1.epcisDocument);
      emptyEventDoc.epcisBody.eventList = [];

      const response = await request(app)
        .post("/epcis/capture")
        .send({ epcisDocument: emptyEventDoc, publishOptions: event1.publishOptions })
        .expect(400);

      expect(response.body.error).to.equal("EPCISDocument contains no events");
    });

    it("returns 500 when publisher is unavailable for capture", async function () {
      this.timeout(15000);
      fetchStub.rejects(new Error("publisher down"));

      const response = await request(app)
        .post("/epcis/capture")
        .send(event1)
        .expect(500);

      expect(response.body.error).to.include("Something went wrong");
      expect(fetchStub.callCount).to.equal(3);
    });

    it("returns 400 when events query has no filters", async () => {
      const response = await request(app).get("/epcis/events").expect(400);
      expectResponseErrorMessage(
        response.body,
        "At least one filter parameter is required.",
      );
    });

    it("returns 400 when 'to' is before 'from'", async () => {
      const response = await request(app)
        .get("/epcis/events")
        .query({
          from: "2024-03-02T00:00:00Z",
          to: "2024-03-01T00:00:00Z",
        })
        .expect(400);
      expectResponseErrorMessage(
        response.body,
        "Parameter 'to' must be greater than or equal to 'from'.",
      );
    });

    it("returns 400 for non-numeric captureID", async () => {
      const response = await request(app).get("/epcis/capture/abc").expect(400);
      expectResponseErrorMessage(response.body, "Invalid captureID format");
    });

    it("returns MCP error when epcis-query has no filters", async () => {
      const result = await mockMcpClient.callTool({
        name: "epcis-query",
        arguments: {},
      });
      const payload = parseToolResult(result);

      expect(result.isError).to.equal(true);
      expect(payload.error).to.include("At least one filter parameter is required.");
    });

    it("returns MCP error when DKG query fails", async () => {
      dkgQueryStub.rejects(new Error("query exploded"));
      const result = await mockMcpClient.callTool({
        name: "epcis-query",
        arguments: { bizStep: "receiving" },
      });
      const payload = parseToolResult(result);

      expect(result.isError).to.equal(true);
      expect(payload.error).to.equal("Query failed");
    });

    it("returns 500 when /epcis/events DKG query fails", async () => {
      dkgQueryStub.rejects(new Error("query exploded"));
      const response = await request(app)
        .get("/epcis/events")
        .query({ bizStep: "receiving" })
        .expect(500);

      expect(response.body.error).to.equal("Failed to query events");
    });
  });

  describe("EpcisQueryService", () => {
    it("normalizes shorthand bizStep to full GS1 URI", () => {
      const queryService = new EpcisQueryService();
      const query = queryService.buildQuery({ bizStep: "receiving" });

      expect(query).to.include("https://ref.gs1.org/cbv/BizStep-receiving");
    });

    it("adds UNION for fullTrace EPC queries", () => {
      const queryService = new EpcisQueryService();
      const query = queryService.buildQuery({ epc: frameEpc, fullTrace: true });

      expect(query).to.include("UNION");
    });

    it("uses full URI when bizStep is provided as shorthand", () => {
      const queryService = new EpcisQueryService();
      const query = queryService.buildQuery({ bizStep: "shipping" });

      expect(query).to.include("https://ref.gs1.org/cbv/BizStep-shipping");
    });

    it("applies explicit LIMIT and OFFSET", () => {
      const queryService = new EpcisQueryService();
      const query = queryService.buildQuery({
        bizStep: "receiving",
        limit: 5,
        offset: 10,
      });

      expect(query).to.include("LIMIT 5");
      expect(query).to.include("OFFSET 10");
    });
  });
});
