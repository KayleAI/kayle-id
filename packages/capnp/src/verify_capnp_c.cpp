#include "verify_capnp_c.h"

#include <capnp/message.h>
#include <capnp/serialize.h>
#include <kj/array.h>

#include <cstring>

#include "verify.capnp.h"

namespace {
template <typename T>
static bool copy_text_to_buffer(T text, char* out, size_t out_size) {
  if (!out || out_size == 0) {
    return false;
  }
  auto data = text.cStr();
  size_t len = text.size();
  if (len + 1 > out_size) {
    return false;
  }
  std::memcpy(out, data, len);
  out[len] = '\0';
  return true;
}
} // namespace

int verify_build_hello(
  void* message_builder,
  const char* attempt_id,
  const char* mobile_write_token,
  const char* device_id,
  const char* app_version
) {
  if (!message_builder || !attempt_id || !mobile_write_token || !app_version) {
    return 0;
  }
  auto* builder = reinterpret_cast<capnp::MallocMessageBuilder*>(message_builder);
  auto root = builder->initRoot<ClientMessage>();
  auto hello = root.initHello();
  hello.setAttemptId(attempt_id);
  hello.setMobileWriteToken(mobile_write_token);
  if (device_id) {
    hello.setDeviceId(device_id);
  }
  hello.setAppVersion(app_version);
  return 1;
}

int verify_build_phase(
  void* message_builder,
  const char* phase,
  const char* error
) {
  if (!message_builder || !phase) {
    return 0;
  }
  auto* builder = reinterpret_cast<capnp::MallocMessageBuilder*>(message_builder);
  auto root = builder->initRoot<ClientMessage>();
  auto phase_msg = root.initPhase();
  phase_msg.setPhase(phase);
  if (error) {
    phase_msg.setError(error);
  }
  return 1;
}

int verify_build_data(
  void* message_builder,
  int data_kind,
  const uint8_t* raw,
  size_t raw_size,
  uint32_t index,
  uint32_t total,
  uint32_t chunk_index,
  uint32_t chunk_total
) {
  if (!message_builder || !raw || raw_size == 0) {
    return 0;
  }
  auto* builder = reinterpret_cast<capnp::MallocMessageBuilder*>(message_builder);
  auto root = builder->initRoot<ClientMessage>();
  auto data_msg = root.initData();
  data_msg.setKind(static_cast<DataKind>(data_kind));
  data_msg.setRaw(kj::ArrayPtr<const capnp::byte>(
    reinterpret_cast<const capnp::byte*>(raw),
    raw_size
  ));
  data_msg.setIndex(index);
  data_msg.setTotal(total);
  data_msg.setChunkIndex(chunk_index);
  data_msg.setChunkTotal(chunk_total);
  return 1;
}

verify_server_message_kind_t verify_server_message_kind(void* message_reader) {
  if (!message_reader) {
    return VERIFY_SERVER_MESSAGE_NONE;
  }
  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  switch (root.which()) {
    case ServerMessage::ACK:
      return VERIFY_SERVER_MESSAGE_ACK;
    case ServerMessage::ERROR:
      return VERIFY_SERVER_MESSAGE_ERROR;
    default:
      return VERIFY_SERVER_MESSAGE_NONE;
  }
}

int verify_server_message_get_ack(
  void* message_reader,
  char* out_message,
  size_t out_message_size
) {
  if (!message_reader) {
    return 0;
  }
  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::ACK) {
    return 0;
  }
  auto ack = root.getAck();
  return copy_text_to_buffer(ack.getMessage(), out_message, out_message_size) ? 1 : 0;
}

int verify_server_message_get_error(
  void* message_reader,
  char* out_code,
  size_t out_code_size,
  char* out_message,
  size_t out_message_size
) {
  if (!message_reader) {
    return 0;
  }
  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::ERROR) {
    return 0;
  }
  auto err = root.getError();
  if (!copy_text_to_buffer(err.getCode(), out_code, out_code_size)) {
    return 0;
  }
  if (!copy_text_to_buffer(err.getMessage(), out_message, out_message_size)) {
    return 0;
  }
  return 1;
}
