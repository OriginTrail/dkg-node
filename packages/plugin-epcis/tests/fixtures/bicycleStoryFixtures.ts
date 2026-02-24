type QueryRow = {
  ual: string;
  eventType: string;
  eventTime: string;
  bizStep: string;
  bizLocation: string;
  disposition: string;
  readPoint: string;
  action: string;
  parentID: string;
  epcList: string;
  childEPCList: string;
  inputEPCs: string;
  outputEPCs: string;
};

const UAL_BASE = "did:dkg:otp:2043";
const EPCIS_OBJECT_EVENT = "https://gs1.github.io/EPCIS/ObjectEvent";
const EPCIS_TRANSFORMATION_EVENT = "https://gs1.github.io/EPCIS/TransformationEvent";
const EPCIS_AGGREGATION_EVENT = "https://gs1.github.io/EPCIS/AggregationEvent";

const FRAME_EPC = "urn:epc:id:sgtin:4012345.011111.1001";
const FRONT_WHEEL_EPC = "urn:epc:id:sgtin:4012345.022222.2001";
const REAR_WHEEL_EPC = "urn:epc:id:sgtin:4012345.022222.2002";
const HANDLEBAR_EPC = "urn:epc:id:sgtin:4012345.033333.3001";
const BICYCLE_EPC = "urn:epc:id:sgtin:4012345.099999.9001";
const PALLET_EPC = "urn:epc:id:sscc:4012345.0000000001";

const RECEIVING_DOCK = "urn:epc:id:sgln:4012345.00001.0";
const QUALITY_LAB = "urn:epc:id:sgln:4012345.00002.0";
const ASSEMBLY_LINE = "urn:epc:id:sgln:4012345.00003.0";
const PACKING_AREA = "urn:epc:id:sgln:4012345.00004.0";

export function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function publisherQueuedResponse(id: number): Response {
  return jsonResponse({ id, status: "queued", attemptCount: 1 });
}

export function publisherStatusResponse(
  status: string,
  ual?: string,
  publishedAt?: string,
): Response {
  return jsonResponse({
    status,
    ...(ual && { ual }),
    ...(publishedAt && { publishedAt }),
  });
}

export function makeDkgQueryResult(rows: QueryRow[]): { data: QueryRow[] } {
  return { data: rows };
}

export const RECEIVING_EVENTS: QueryRow[] = [
  {
    ual: `${UAL_BASE}/1/private`,
    eventType: EPCIS_OBJECT_EVENT,
    eventTime: "2024-03-01T08:00:00.000Z",
    bizStep: "https://ref.gs1.org/cbv/BizStep-receiving",
    bizLocation: RECEIVING_DOCK,
    disposition: "https://ref.gs1.org/cbv/Disp-in_progress",
    readPoint: RECEIVING_DOCK,
    action: "ADD",
    parentID: "",
    epcList: FRAME_EPC,
    childEPCList: "",
    inputEPCs: "",
    outputEPCs: "",
  },
  {
    ual: `${UAL_BASE}/2/private`,
    eventType: EPCIS_OBJECT_EVENT,
    eventTime: "2024-03-01T08:30:00.000Z",
    bizStep: "https://ref.gs1.org/cbv/BizStep-receiving",
    bizLocation: RECEIVING_DOCK,
    disposition: "https://ref.gs1.org/cbv/Disp-in_progress",
    readPoint: RECEIVING_DOCK,
    action: "ADD",
    parentID: "",
    epcList: `${FRONT_WHEEL_EPC}, ${REAR_WHEEL_EPC}`,
    childEPCList: "",
    inputEPCs: "",
    outputEPCs: "",
  },
  {
    ual: `${UAL_BASE}/3/private`,
    eventType: EPCIS_OBJECT_EVENT,
    eventTime: "2024-03-01T09:00:00.000Z",
    bizStep: "https://ref.gs1.org/cbv/BizStep-receiving",
    bizLocation: RECEIVING_DOCK,
    disposition: "https://ref.gs1.org/cbv/Disp-in_progress",
    readPoint: RECEIVING_DOCK,
    action: "ADD",
    parentID: "",
    epcList: HANDLEBAR_EPC,
    childEPCList: "",
    inputEPCs: "",
    outputEPCs: "",
  },
];

export const QUALITY_LAB_EVENTS: QueryRow[] = [
  {
    ual: `${UAL_BASE}/4/private`,
    eventType: EPCIS_OBJECT_EVENT,
    eventTime: "2024-03-01T10:00:00.000Z",
    bizStep: "https://ref.gs1.org/cbv/BizStep-inspecting",
    bizLocation: QUALITY_LAB,
    disposition: "https://ref.gs1.org/cbv/Disp-conformant",
    readPoint: QUALITY_LAB,
    action: "OBSERVE",
    parentID: "",
    epcList: FRAME_EPC,
    childEPCList: "",
    inputEPCs: "",
    outputEPCs: "",
  },
  {
    ual: `${UAL_BASE}/5/private`,
    eventType: EPCIS_OBJECT_EVENT,
    eventTime: "2024-03-01T10:30:00.000Z",
    bizStep: "https://ref.gs1.org/cbv/BizStep-inspecting",
    bizLocation: QUALITY_LAB,
    disposition: "https://ref.gs1.org/cbv/Disp-conformant",
    readPoint: QUALITY_LAB,
    action: "OBSERVE",
    parentID: "",
    epcList: `${FRONT_WHEEL_EPC}, ${REAR_WHEEL_EPC}`,
    childEPCList: "",
    inputEPCs: "",
    outputEPCs: "",
  },
  {
    ual: `${UAL_BASE}/7/private`,
    eventType: EPCIS_OBJECT_EVENT,
    eventTime: "2024-03-01T15:00:00.000Z",
    bizStep: "https://ref.gs1.org/cbv/BizStep-inspecting",
    bizLocation: QUALITY_LAB,
    disposition: "https://ref.gs1.org/cbv/Disp-conformant",
    readPoint: QUALITY_LAB,
    action: "OBSERVE",
    parentID: "",
    epcList: BICYCLE_EPC,
    childEPCList: "",
    inputEPCs: "",
    outputEPCs: "",
  },
];

const ASSEMBLY_EVENT: QueryRow = {
  ual: `${UAL_BASE}/6/private`,
  eventType: EPCIS_TRANSFORMATION_EVENT,
  eventTime: "2024-03-01T14:00:00.000Z",
  bizStep: "https://ref.gs1.org/cbv/BizStep-assembling",
  bizLocation: ASSEMBLY_LINE,
  disposition: "https://ref.gs1.org/cbv/Disp-active",
  readPoint: ASSEMBLY_LINE,
  action: "",
  parentID: "",
  epcList: "",
  childEPCList: "",
  inputEPCs: `${FRAME_EPC}, ${FRONT_WHEEL_EPC}, ${REAR_WHEEL_EPC}, ${HANDLEBAR_EPC}`,
  outputEPCs: BICYCLE_EPC,
};

const PACKING_EVENT: QueryRow = {
  ual: `${UAL_BASE}/8/private`,
  eventType: EPCIS_AGGREGATION_EVENT,
  eventTime: "2024-03-01T16:00:00.000Z",
  bizStep: "https://ref.gs1.org/cbv/BizStep-packing",
  bizLocation: PACKING_AREA,
  disposition: "https://ref.gs1.org/cbv/Disp-in_transit",
  readPoint: PACKING_AREA,
  action: "ADD",
  parentID: PALLET_EPC,
  epcList: "",
  childEPCList: BICYCLE_EPC,
  inputEPCs: "",
  outputEPCs: "",
};

export const FRAME_TRACE_EVENTS: QueryRow[] = [
  RECEIVING_EVENTS[0],
  QUALITY_LAB_EVENTS[0],
  ASSEMBLY_EVENT,
];

export const BICYCLE_TRACE_EVENTS: QueryRow[] = [
  ASSEMBLY_EVENT,
  QUALITY_LAB_EVENTS[2],
  PACKING_EVENT,
];

export const ASSEMBLY_EVENTS: QueryRow[] = [ASSEMBLY_EVENT];
