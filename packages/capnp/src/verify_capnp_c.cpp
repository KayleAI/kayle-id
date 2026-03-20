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

int verify_build_share_selection(
  void* message_builder,
  const char* session_id,
  const char* const* selected_field_keys,
  size_t selected_field_key_count
) {
  if (!message_builder || !session_id) {
    return 0;
  }

  auto* builder = reinterpret_cast<capnp::MallocMessageBuilder*>(message_builder);
  auto root = builder->initRoot<ClientMessage>();
  auto share_selection = root.initShareSelection();
  share_selection.setSessionId(session_id);
  auto keys = share_selection.initSelectedFieldKeys(
    static_cast<uint32_t>(selected_field_key_count)
  );

  for (size_t index = 0; index < selected_field_key_count; index += 1) {
    const char* key = selected_field_keys[index];
    if (!key) {
      return 0;
    }
    keys.set(static_cast<uint32_t>(index), key);
  }

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
    case ServerMessage::VERDICT:
      return VERIFY_SERVER_MESSAGE_VERDICT;
    case ServerMessage::SHARE_REQUEST:
      return VERIFY_SERVER_MESSAGE_SHARE_REQUEST;
    case ServerMessage::SHARE_READY:
      return VERIFY_SERVER_MESSAGE_SHARE_READY;
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

int verify_server_message_get_verdict(
  void* message_reader,
  int* out_outcome,
  char* out_reason_code,
  size_t out_reason_code_size,
  char* out_reason_message,
  size_t out_reason_message_size,
  int* out_retry_allowed,
  uint32_t* out_remaining_attempts
) {
  if (
    !message_reader ||
    !out_outcome ||
    !out_retry_allowed ||
    !out_remaining_attempts
  ) {
    return 0;
  }

  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::VERDICT) {
    return 0;
  }

  auto verdict = root.getVerdict();
  *out_outcome = verdict.getOutcome() == VerdictOutcome::ACCEPTED
    ? VERIFY_SERVER_VERDICT_ACCEPTED
    : VERIFY_SERVER_VERDICT_REJECTED;

  if (
    !copy_text_to_buffer(
      verdict.getReasonCode(),
      out_reason_code,
      out_reason_code_size
    )
  ) {
    return 0;
  }

  if (
    !copy_text_to_buffer(
      verdict.getReasonMessage(),
      out_reason_message,
      out_reason_message_size
    )
  ) {
    return 0;
  }

  *out_retry_allowed = verdict.getRetryAllowed() ? 1 : 0;
  *out_remaining_attempts = verdict.getRemainingAttempts();
  return 1;
}

int verify_server_message_get_share_request(
  void* message_reader,
  uint32_t* out_contract_version,
  char* out_session_id,
  size_t out_session_id_size,
  uint32_t* out_field_count
) {
  if (
    !message_reader ||
    !out_contract_version ||
    !out_field_count
  ) {
    return 0;
  }

  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::SHARE_REQUEST) {
    return 0;
  }

  auto share_request = root.getShareRequest();
  *out_contract_version = share_request.getContractVersion();
  *out_field_count = share_request.getFields().size();

  if (
    !copy_text_to_buffer(
      share_request.getSessionId(),
      out_session_id,
      out_session_id_size
    )
  ) {
    return 0;
  }

  return 1;
}

int verify_server_message_get_share_request_field(
  void* message_reader,
  uint32_t field_index,
  char* out_key,
  size_t out_key_size,
  char* out_reason,
  size_t out_reason_size,
  int* out_required
) {
  if (!message_reader || !out_required) {
    return 0;
  }

  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::SHARE_REQUEST) {
    return 0;
  }

  auto fields = root.getShareRequest().getFields();
  if (field_index >= fields.size()) {
    return 0;
  }

  auto field = fields[field_index];
  if (!copy_text_to_buffer(field.getKey(), out_key, out_key_size)) {
    return 0;
  }

  if (!copy_text_to_buffer(field.getReason(), out_reason, out_reason_size)) {
    return 0;
  }

  *out_required = field.getRequired() ? 1 : 0;
  return 1;
}

int verify_server_message_get_share_ready(
  void* message_reader,
  char* out_session_id,
  size_t out_session_id_size,
  uint32_t* out_field_count
) {
  if (!message_reader || !out_field_count) {
    return 0;
  }

  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::SHARE_READY) {
    return 0;
  }

  auto share_ready = root.getShareReady();
  *out_field_count = static_cast<uint32_t>(share_ready.getSelectedFieldKeys().size());

  if (
    !copy_text_to_buffer(
      share_ready.getSessionId(),
      out_session_id,
      out_session_id_size
    )
  ) {
    return 0;
  }

  return 1;
}

int verify_server_message_get_share_ready_field(
  void* message_reader,
  uint32_t field_index,
  char* out_key,
  size_t out_key_size
) {
  if (!message_reader) {
    return 0;
  }

  auto* reader = reinterpret_cast<capnp::MessageReader*>(message_reader);
  auto root = reader->getRoot<ServerMessage>();
  if (root.which() != ServerMessage::SHARE_READY) {
    return 0;
  }

  auto keys = root.getShareReady().getSelectedFieldKeys();
  if (field_index >= keys.size()) {
    return 0;
  }

  return copy_text_to_buffer(keys[field_index], out_key, out_key_size) ? 1 : 0;
}
