export interface Station {
  code: string;
  name: string;
}

export interface StationTime extends Station {
  time: string;
  stationIdx: number;
  stationSeq: number;
  sec: number;
  directFlag: string;
}

export interface RouteLeg {
  seq: number;
  duration: number;
  distance: number;
  blockId: string;
  blockSeq: number;
  trainId: string;
  trainName: string;
  routeId: string;
  routeName: string;
  senkuCode: string;
  senkuName: string;
  rapidId: string;
  rapidName: string;
  directionId: string;
  directionName: string;
  nickname: string;
  isExpress: boolean;
  from: StationTime;
  to: StationTime;
  train: string;
  orgSenkuName: string;
  notfoundSenkuMaster: number;
}

export interface Route {
  id: string;
  routeKey: string;
  patternId: number;
  origin: Station;
  destination: Station;
  hour: number;
  pattern: number;
  departureTime: string;
  arrivalTime: string;
  duration: number;
  transfers: number;
  hasExpress: boolean;
  legs: RouteLeg[];
  sourceFile: string;
  importedAt: string;
  _rid?: string;
  _self?: string;
  _etag?: string;
  _attachments?: string;
  _ts?: number;
}

export interface RouteSearchResult {
  routes: Route[];
  searchTime: number;
}