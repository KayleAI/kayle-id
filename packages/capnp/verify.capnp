@0xef7e0b8fbd1f2ab3;

struct ClientHello {
  attemptId @0 :Text;
  mobileWriteToken @1 :Text;
  deviceId @2 :Text;
  appVersion @3 :Text;
}

struct PhaseUpdate {
  phase @0 :Text;
  error @1 :Text;
}

enum DataKind {
  dg1 @0;
  dg2 @1;
  sod @2;
  selfie @3;
}

struct DataPayload {
  kind @0 :DataKind;
  raw @1 :Data;
  index @2 :UInt32;
  total @3 :UInt32;
  chunkIndex @4 :UInt32;
  chunkTotal @5 :UInt32;
}

struct ClientMessage {
  union {
    hello @0 :ClientHello;
    phase @1 :PhaseUpdate;
    data @2 :DataPayload;
  }
}

struct ServerAck {
  message @0 :Text;
}

struct ServerError {
  code @0 :Text;
  message @1 :Text;
}

struct ServerMessage {
  union {
    ack @0 :ServerAck;
    error @1 :ServerError;
  }
}
