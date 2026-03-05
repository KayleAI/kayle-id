import Capnp
import Foundation

@_silgen_name("verify_build_hello")
nonisolated private func verify_build_hello(
  _ builder: UnsafeMutableRawPointer?,
  _ attemptId: UnsafePointer<CChar>?,
  _ mobileWriteToken: UnsafePointer<CChar>?,
  _ deviceId: UnsafePointer<CChar>?,
  _ appVersion: UnsafePointer<CChar>?
) -> Int32

@_silgen_name("verify_build_phase")
nonisolated private func verify_build_phase(
  _ builder: UnsafeMutableRawPointer?,
  _ phase: UnsafePointer<CChar>?,
  _ error: UnsafePointer<CChar>?
) -> Int32

@_silgen_name("verify_build_data")
nonisolated private func verify_build_data(
  _ builder: UnsafeMutableRawPointer?,
  _ dataKind: Int32,
  _ raw: UnsafePointer<UInt8>?,
  _ rawSize: Int,
  _ index: UInt32,
  _ total: UInt32,
  _ chunkIndex: UInt32,
  _ chunkTotal: UInt32
) -> Int32

@_silgen_name("verify_server_message_kind")
nonisolated private func verify_server_message_kind(_ reader: UnsafeMutableRawPointer?) -> Int32

@_silgen_name("verify_server_message_get_ack")
nonisolated private func verify_server_message_get_ack(
  _ reader: UnsafeMutableRawPointer?,
  _ outMessage: UnsafeMutablePointer<CChar>?,
  _ outMessageSize: Int
) -> Int32

@_silgen_name("verify_server_message_get_error")
nonisolated private func verify_server_message_get_error(
  _ reader: UnsafeMutableRawPointer?,
  _ outCode: UnsafeMutablePointer<CChar>?,
  _ outCodeSize: Int,
  _ outMessage: UnsafeMutablePointer<CChar>?,
  _ outMessageSize: Int
) -> Int32

enum VerifyServerMessageKind: Int32 {
  case none = 0
  case ack = 1
  case error = 2
}

struct VerifyServerMessage {
  let ackMessage: String?
  let errorCode: String?
  let errorMessage: String?
}

final class VerifyCapnpCodec {
  nonisolated func encodeHello(
    attemptId: String,
    mobileWriteToken: String,
    deviceId: String?,
    appVersion: String
  ) -> Data? {
    guard let builder = CapnpMessageBuilder() else {
      return nil
    }

    let result = attemptId.withCString { attemptCString in
      mobileWriteToken.withCString { tokenCString in
        appVersion.withCString { appCString in
          if let deviceId {
            return deviceId.withCString { deviceCString in
              verify_build_hello(
                builder.opaque,
                attemptCString,
                tokenCString,
                deviceCString,
                appCString
              )
            }
          }
          return verify_build_hello(
            builder.opaque,
            attemptCString,
            tokenCString,
            nil,
            appCString
          )
        }
      }
    }

    guard result == 1 else {
      return nil
    }

    return builder.toBytes()
  }

  nonisolated func encodePhase(phase: String, error: String?) -> Data? {
    guard let builder = CapnpMessageBuilder() else {
      return nil
    }

    let result = phase.withCString { phaseCString in
      if let error {
        return error.withCString { errorCString in
          verify_build_phase(builder.opaque, phaseCString, errorCString)
        }
      }
      return verify_build_phase(builder.opaque, phaseCString, nil)
    }

    guard result == 1 else {
      return nil
    }

    return builder.toBytes()
  }

  nonisolated func encodeData(
    kind: VerifyDataKind,
    raw: Data,
    index: Int?,
    total: Int?,
    chunkIndex: Int?,
    chunkTotal: Int?
  ) -> Data? {
    guard let builder = CapnpMessageBuilder() else {
      return nil
    }

    let idx = UInt32(index ?? 0)
    let tot = UInt32(total ?? 0)
    let chunkIdx = UInt32(chunkIndex ?? 0)
    let chunkTot = UInt32(chunkTotal ?? 0)

    let result = raw.withUnsafeBytes { rawBuffer -> Int32 in
      guard let base = rawBuffer.baseAddress else { return 0 }
      let ptr = base.assumingMemoryBound(to: UInt8.self)
      return verify_build_data(
        builder.opaque,
        Int32(kind.rawValue),
        ptr,
        raw.count,
        idx,
        tot,
        chunkIdx,
        chunkTot
      )
    }

    guard result == 1 else {
      return nil
    }

    return builder.toBytes()
  }

  nonisolated func decodeServerMessage(_ data: Data) -> VerifyServerMessage? {
    guard let reader = CapnpMessageReader(data: data, format: .unpacked) else {
      return nil
    }

    let kind = VerifyServerMessageKind(rawValue: verify_server_message_kind(reader.opaque)) ?? .none
    switch kind {
    case .ack:
      var buffer = [CChar](repeating: 0, count: 256)
      let ok = verify_server_message_get_ack(reader.opaque, &buffer, buffer.count)
      if ok == 1 {
        return VerifyServerMessage(ackMessage: String(cString: buffer), errorCode: nil, errorMessage: nil)
      }
      return VerifyServerMessage(ackMessage: nil, errorCode: nil, errorMessage: nil)
    case .error:
      var codeBuffer = [CChar](repeating: 0, count: 128)
      var messageBuffer = [CChar](repeating: 0, count: 256)
      let ok = verify_server_message_get_error(
        reader.opaque,
        &codeBuffer,
        codeBuffer.count,
        &messageBuffer,
        messageBuffer.count
      )
      if ok == 1 {
        return VerifyServerMessage(
          ackMessage: nil,
          errorCode: String(cString: codeBuffer),
          errorMessage: String(cString: messageBuffer)
        )
      }
      return VerifyServerMessage(ackMessage: nil, errorCode: nil, errorMessage: nil)
    case .none:
      return nil
    }
  }
}
